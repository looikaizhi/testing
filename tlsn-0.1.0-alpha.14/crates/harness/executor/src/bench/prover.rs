use std::sync::atomic::Ordering;

use anyhow::Result;
use futures::{AsyncReadExt, AsyncWriteExt, TryFutureExt};

use harness_core::bench::{Bench, ProverMetrics};
use tlsn::{
    Session,
    config::{
        prove::ProveConfig,
        prover::ProverConfig,
        tls::TlsClientConfig,
        tls_commit::{TlsCommitConfig, mpc::MpcTlsConfig},
    },
    connection::ServerName,
    webpki::{CertificateDer, RootCertStore},
};
use tlsn_server_fixture_certs::{CA_CERT_DER, SERVER_DOMAIN};

use crate::{
    IoProvider,
    bench::{Meter, RECV_PADDING},
    spawn,
};

pub async fn bench_prover(provider: &IoProvider, config: &Bench) -> Result<ProverMetrics> {
    let verifier_io = Meter::new(provider.provide_proto_io().await?);

    let sent = verifier_io.sent();
    let recv = verifier_io.recv();

    let mut session = Session::new(verifier_io);

    let prover = session.new_prover(ProverConfig::builder().build()?)?;
    let (session, handle) = session.split();

    _ = spawn(session);

    let time_start = web_time::Instant::now();

    let prover = prover
        .commit(
            TlsCommitConfig::builder()
                .protocol({
                    let mut builder = MpcTlsConfig::builder()
                        .max_sent_data(config.upload_size)
                        .defer_decryption_from_start(config.defer_decryption);

                    if !config.defer_decryption {
                        builder = builder.max_recv_data_online(config.download_size + RECV_PADDING);
                    }

                    builder
                        .max_recv_data(config.download_size + RECV_PADDING)
                        .build()
                }?)
                .build()?,
        )
        .await?;

    let time_preprocess = time_start.elapsed().as_millis();
    let time_start_online = web_time::Instant::now();
    let uploaded_preprocess = sent.load(Ordering::Relaxed);
    let downloaded_preprocess = recv.load(Ordering::Relaxed);

    let (mut conn, prover_fut) = prover
        .connect(
            TlsClientConfig::builder()
                .server_name(ServerName::Dns(SERVER_DOMAIN.try_into()?))
                .root_store(RootCertStore {
                    roots: vec![CertificateDer(CA_CERT_DER.to_vec())],
                })
                .build()?,
            provider.provide_server_io().await?,
        )
        .await?;

    let (_, mut prover) = futures::try_join!(
        async {
            let request = format!(
                "GET /bytes?size={} HTTP/1.1\r\nConnection: close\r\nData: {}\r\n\r\n",
                config.download_size,
                // Subtract the 68 bytes already present in the request template.
                String::from_utf8(vec![0x42u8; config.upload_size.saturating_sub(68)])?,
            );

            conn.write_all(request.as_bytes()).await?;

            let mut response = Vec::new();
            conn.read_to_end(&mut response).await?;
            conn.close().await?;

            Ok(())
        },
        prover_fut.map_err(anyhow::Error::from)
    )?;

    let time_online = time_start_online.elapsed().as_millis();
    let uploaded_online = sent.load(Ordering::Relaxed) - uploaded_preprocess;
    let downloaded_online = recv.load(Ordering::Relaxed) - downloaded_preprocess;

    let (sent_len, recv_len) = prover.transcript().len();

    let mut builder = ProveConfig::builder(prover.transcript());

    let (reveal_sent_range, reveal_recv_range, reveal_recv_percent_actual) = if config.reveal_all {
        (0..sent_len, 0..recv_len, 100.0)
    } else {
        // `reveal_recv_percent` controls both directions in bench mode.
        // Keep at least 1 byte hidden in each direction to avoid reveal-all optimization.
        let reveal_percent = config.reveal_recv_percent.clamp(1, 100);
        let reveal_end = |len: usize| {
            len.saturating_mul(reveal_percent)
                .div_euclid(100)
                .min(len.saturating_sub(1))
        };
        let reveal_sent_end = reveal_end(sent_len);
        let reveal_recv_end = reveal_end(recv_len);
        let actual = if recv_len == 0 {
            0.0
        } else {
            (reveal_recv_end as f64) * 100.0 / (recv_len as f64)
        };

        (0..reveal_sent_end, 0..reveal_recv_end, actual)
    };

    builder
        .server_identity()
        .reveal_sent(&reveal_sent_range)?
        .reveal_recv(&reveal_recv_range)?;

    let prove_config = builder.build()?;

    prover.prove(&prove_config).await?;
    prover.close().await?;
    handle.close();

    let time_total = time_start.elapsed().as_millis();

    Ok(ProverMetrics {
        time_preprocess: time_preprocess as u64,
        time_online: time_online as u64,
        time_total: time_total as u64,
        uploaded_preprocess,
        downloaded_preprocess,
        uploaded_online,
        downloaded_online,
        uploaded_total: sent.load(Ordering::Relaxed),
        downloaded_total: recv.load(Ordering::Relaxed),
        reveal_recv_percent_actual: Some(reveal_recv_percent_actual),
        heap_max_bytes: None,
    })
}
