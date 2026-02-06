import { Plugin } from './types';

export const plugins: Record<string, Plugin> = {
    alipay: {
        name: 'Alipay Login Account',
        description: 'Prove Alipay merchant logonName and masterCustomerId',
        logo: '💰',
        file: '/plugins/alipay.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value
        },
    },
    twitter: {
        name: 'Twitter Profile',
        description: 'Prove your Twitter profile information with cryptographic verification',
        logo: '𝕏',
        file: '/plugins/twitter.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    swissbank: {
        name: 'Swiss Bank',
        description: 'Verify your Swiss bank account balance securely and privately. (Login: admin / admin)',
        logo: '🏦',
        file: '/plugins/swissbank.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    spotify: {
        name: 'Spotify',
        description: 'Prove your Spotify listening history and music preferences',
        logo: '🎵',
        file: '/plugins/spotify.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
    duolingo: {
        name: 'Duolingo',
        description: 'Prove your Duolingo language learning progress and achievements',
        logo: '🦉',
        file: '/plugins/duolingo.js',
        parseResult: (json) => {
            return json.results[json.results.length - 1].value;
        },
    },
};
