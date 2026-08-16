        let allCoins = [];

        let portfolio = JSON.parse(localStorage.getItem('portfolio_ultimate')) || [];

        let alerts = JSON.parse(localStorage.getItem('alerts_ultimate')) || [];

        let chartInstances = {};

        let tradeHistory = [];  // All trades buffer (max 1000 most recent)

        let selectedCoinId = null;  // Track current coin for WebSocket

        let tradeWebSocket = null;  // WebSocket connection (Binance)

        let bybitTradeWebSocket = null;  // WebSocket connection (Bybit — second whale-order source)

        let okxTradeWebSocket = null;  // WebSocket connection (OKX — third source, helps thin pairs like PAXG)

        let tradeRestPollInterval = null;  // REST backstop — keeps the tape populated even if all sockets go quiet

        const seenTradeKeys = new Set();  // de-dupe key so REST backfill + live sockets don't double-count trades

        const assetConfig = {
            'BTC': { leverage: 200, fee: 0.00012 },
            'PAXG': { leverage: 50, fee: 0.0001 }
        };

        let selectedCoin = null;

        let tradeUpdateInterval = null;

        let whaleOrderInterval = null;

        let pxDataInterval = null;

        let obAnalysisInterval = null;

        let pxChainInterval = null;

        let pxOptionsInterval = null;

        const _whaleAxisCache = {};

        const PORTFOLIO_MAKER_FEE = { BTC: 0.0002, PAXG: 0.0001 };

        const FUNDING_RATE_8H = 0.0001; // 0.01% per 8h