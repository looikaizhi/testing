use anyhow::Result;

use harness_core::bench::{Bench, VerifierMetrics};
use tlsn::{
    config::{CertificateDer, ProtocolConfigValidator, RootCertStore},
    verifier::{Verifier, VerifierConfig, VerifyConfig},
};
use tlsn_server_fixture_certs::CA_CERT_DER;

use crate::{IoProvider, bench::RECV_PADDING};

pub async fn bench_verifier(provider: &IoProvider, config: &Bench) -> Result<VerifierMetrics> {
    let mut builder = ProtocolConfigValidator::builder();
    builder
        .max_sent_data(config.upload_size)
        .max_recv_data(config.download_size + RECV_PADDING);

    let protocol_config = builder.build()?;

    let verifier = Verifier::new(
        VerifierConfig::builder()
            .root_store(RootCertStore {
                roots: vec![CertificateDer(CA_CERT_DER.to_vec())],
            })
            .protocol_config_validator(protocol_config)
            .build()?,
    );

    let verifier = verifier.setup(provider.provide_proto_io().await?).await?;
    let time_start = web_time::Instant::now();
    let mut verifier = verifier.run().await?;
    let output = verifier.verify(&VerifyConfig::default()).await?;
    verifier.close().await?;

    let time_zk_verify = output.verify_zk_time_ms;
    let time_total = time_start.elapsed().as_millis();

    Ok(VerifierMetrics {
        time_zk_verify: time_zk_verify as u64,
        time_verify: time_total as u64,
    })
}
