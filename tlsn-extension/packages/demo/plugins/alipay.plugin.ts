/// <reference types="@tlsn/plugin-sdk/src/globals" />

// Environment variables injected at build time
// @ts-ignore - These will be replaced at build time by Vite's define option
const VERIFIER_URL = VITE_VERIFIER_URL;
// @ts-ignore
const PROXY_URL_BASE = VITE_PROXY_URL;

const HOST = 'enterpriseportal.alipay.com';
const PATH = '/pamir/login/queryLoginAccount.json';
const FULL_URL = `https://${HOST}${PATH}`;
const LANDING_URL = 'https://b.alipay.com/page/mbillexprod/fund/business/operate/detail';

const config = {
    name: 'Alipay Login Account',
    description: 'Verify Alipay merchant logonName and masterCustomerId (selective disclosure).',
    requests: [
        {
            method: 'GET',
            host: HOST,
            pathname: PATH,
            verifierUrl: VERIFIER_URL,
        },
    ],
    urls: [
        'https://enterpriseportal.alipay.com/*',
        'https://b.alipay.com/*',
        'https://auth.alipay.com/login/*', 
    ],
};

async function onClick() {
    console.log('[alipay] onClick start');
    try {
        const isRequestPending = useState('isRequestPending', false);
        if (isRequestPending) {
            console.log('[alipay] onClick ignored: request pending');
            return;
        }
        setState('isRequestPending', true);

        const cachedCookie = useState('cookie', null);
        const cachedOrigin = useState('origin', null);
        const cachedReferer = useState('referer', null);
        const cachedAccept = useState('accept', null);
        const cachedAcceptLanguage = useState('acceptLanguage', null);

        if (!cachedCookie) {
            console.log('[alipay] missing cookie, abort');
            setState('isRequestPending', false);
            return;
        }

        const headers: Record<string, string> = {
            cookie: cachedCookie,
            Host: HOST,
            'Accept-Encoding': 'identity',
            Connection: 'close',
        };

        if (cachedOrigin) headers.origin = cachedOrigin;
        if (cachedReferer) headers.referer = cachedReferer;
        if (cachedAccept) headers.accept = cachedAccept;
        if (cachedAcceptLanguage) headers['accept-language'] = cachedAcceptLanguage;

        console.log('[alipay] prove start', {
            url: FULL_URL,
            headerKeys: Object.keys(headers),
            cookieLen: cachedCookie.length,
        });

        const resp = await prove(
            {
                url: FULL_URL,
                method: 'GET',
                headers: headers,
            },
            {
                verifierUrl: VERIFIER_URL,
                proxyUrl: PROXY_URL_BASE + HOST,
                maxRecvData: 4000,
                maxSentData: 2000,
                handlers: [
                    { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
                    { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
                    {
                        type: 'RECV',
                        part: 'HEADERS',
                        action: 'REVEAL',
                        params: { key: 'date' },
                    },
                    {
                        type: 'RECV',
                        part: 'BODY',
                        action: 'REVEAL',
                        params: { type: 'json', path: 'data.logonName', hideKey: true },
                    },
                    {
                        type: 'RECV',
                        part: 'BODY',
                        action: 'REVEAL',
                        params: { type: 'json', path: 'data.masterCustomerId', hideKey: true },
                    },
                ],
            }
        );

        console.log('[alipay] prove ok');
        done(JSON.stringify(resp));
    } catch (err) {
        console.error('[alipay] onClick error', err);
        setState('isRequestPending', false);
    }
}

function expandUI() {
    setState('isMinimized', false);
}

function minimizeUI() {
    setState('isMinimized', true);
}

function main() {
    const isMinimized = useState('isMinimized', false);
    const isRequestPending = useState('isRequestPending', false);
    const cachedCookie = useState('cookie', null);
    const cachedOrigin = useState('origin', null);
    const cachedReferer = useState('referer', null);
    const cachedAccept = useState('accept', null);
    const cachedAcceptLanguage = useState('acceptLanguage', null);
    const headerSeen = useState('headerSeen', false);
    const headerUrl = useState('headerUrl', null);
    const headerMethod = useState('headerMethod', null);
    const headerHasCookie = useState('headerHasCookie', false);
    const debugLogged = useState('debugLogged', false);

    if (!debugLogged) {
        console.log('[alipay] main render');
        setState('debugLogged', true);
    }

    try{
        if (!cachedCookie) {
            const [header] = useHeaders((headers: any[]) =>
                headers.filter((h) => typeof h?.url === 'string' && h.url.includes(FULL_URL))
            );

            if (header) {
                setState('headerSeen', true);
                setState('headerUrl', header.url);
                setState('headerMethod', header.method);
                const cookie = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'cookie')?.value;
                const origin = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'origin')?.value;
                const referer = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'referer')?.value;
                const accept = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'accept')?.value;
                const acceptLanguage = header.requestHeaders.find((h: any) => h.name?.toLowerCase() === 'accept-language')?.value;

                if (cookie && !cachedCookie) {
                    setState('cookie', cookie);
                    console.log('[alipay] cookie found: ', cookie);
                }
                setState('headerHasCookie', !!cookie);
                
                if (origin && !cachedOrigin) {
                    setState('origin', origin);
                    console.log('[alipay] origin found: ', origin);
                }
                if (referer && !cachedReferer) {
                    setState('referer', referer);
                    console.log('[alipay] referer found: ', referer);
                }
                if (accept && !cachedAccept) {
                    setState('accept', accept);
                    console.log('[alipay] accept found: ', accept);
                }
                if (acceptLanguage && !cachedAcceptLanguage) {
                    setState('acceptLanguage', acceptLanguage);
                    console.log('[alipay] accept-language found: ', acceptLanguage);
                }
            }
        }
    } catch (error){
        console.log('Main Error: ', error);
    }

    const headerDetected = !!headerSeen;

    useEffect(() => {
        openWindow(LANDING_URL);
    }, []);

    if (isMinimized) {
        return div(
            {
                style: {
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: '#1677ff',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                    zIndex: '999999',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    fontSize: '24px',
                    color: 'white',
                },
                onclick: 'expandUI',
            },
            ['💰']
        );
    }

    return div(
        {
            style: {
                position: 'fixed',
                bottom: '0',
                right: '8px',
                width: '320px',
                borderRadius: '8px 8px 0 0',
                backgroundColor: 'white',
                boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
                zIndex: '999999',
                fontSize: '14px',
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                overflow: 'hidden',
            },
        },
        [
            div(
                {
                    style: {
                        background: 'linear-gradient(135deg, #1677ff 0%, #3f8cff 100%)',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: 'white',
                    },
                },
                [
                    div(
                        {
                            style: {
                                fontWeight: '600',
                                fontSize: '16px',
                            },
                        },
                        ['Alipay Login Account']
                    ),
                    button(
                        {
                            style: {
                                background: 'transparent',
                                border: 'none',
                                color: 'white',
                                fontSize: '20px',
                                cursor: 'pointer',
                            },
                            onclick: 'minimizeUI',
                        },
                        ['−']
                    ),
                ]
            ),
            div(
                {
                    style: {
                        padding: '16px',
                    },
                },
                [
                    div(
                        {
                            style: {
                                fontSize: '12px',
                                color: '#666',
                                marginBottom: '12px',
                            },
                        },
                        [
                            'Open the Alipay detail page, then wait for the account request to appear.',
                        ]
                    ),
                    headerDetected ? div(
                        {
                            style: {
                                marginBottom: '12px',
                                padding: '10px',
                                borderRadius: '6px',
                                backgroundColor: '#eef3ff',
                                color: '#0b2e6f',
                                border: '1px solid #cfdcff',
                                fontSize: '12px',
                                lineHeight: '1.4',
                            },
                        },
                        [
                            headerUrl ? `Header URL: ${headerUrl}` : 'Header URL: (none)',
                            ' ',
                            headerMethod ? `Method: ${headerMethod}` : '',
                        ]
                    ) : '',
                    div(
                        {
                            style: {
                                marginBottom: '12px',
                                padding: '10px',
                                borderRadius: '6px',
                                backgroundColor: headerDetected ? '#e6fffb' : '#fff1f0',
                                color: headerDetected ? '#006d75' : '#a8071a',
                                border: headerDetected ? '1px solid #b5f5ec' : '1px solid #ffa39e',
                                fontSize: '12px',
                            },
                        },
                        [
                            headerDetected
                                ? headerHasCookie
                                    ? 'Header detected with Cookie'
                                    : 'Header detected (Cookie missing)'
                                : 'No header detected',
                        ]
                    ),
                    headerDetected ? button(
                        {
                            style: {
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                backgroundColor: isRequestPending ? '#d9d9d9' : '#1677ff',
                                color: 'white',
                                border: 'none',
                                cursor: isRequestPending ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                            },
                            onclick: 'onClick',
                        },
                        [isRequestPending ? 'Generating...' : 'Generate Proof']
                    ) : ""
                ]
            ),
        ]
    );
}

export default { main, onClick, expandUI, minimizeUI, config};
