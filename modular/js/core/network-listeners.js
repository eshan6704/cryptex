        let tradeSocketGen = 0;

        const tradeReconnAttempts = { binance: 0, bybit: 0, okx: 0 };

        function tradeBackoffMs(n) { return Math.min(1000 * Math.pow(2, n), 30000); }
// fetchWithTimeout is defined in js/core/network.js, loaded before this file.

// Browser-level connectivity: on 'offline' we stop burning reconnect attempts
// (they'd fail anyway); on 'online' we immediately retry live feeds instead of
// waiting out whatever backoff timer happened to be in flight.
window.addEventListener('offline', () => {
    console.log('Network offline — pausing live feed reconnects until back online');
});
window.addEventListener('online', () => {
    console.log('Network back online — reconnecting live feeds');
    tradeReconnAttempts.binance = 0;
    tradeReconnAttempts.bybit = 0;
    tradeReconnAttempts.okx = 0;
    // Force-reconnect the main ticker/trade/depth sockets immediately rather than
    // waiting out whatever backoff timer happened to be pending when we went offline.
    try { if (typeof app !== 'undefined' && app) { app.reconnAttempts = 0; app.connectWS(); if (app.diffWs) app.startDiffStream(); } } catch {}
    // Re-arm the recent-trades tape sockets (Binance/Bybit/OKX) for whichever coin was active.
    try {
        if (selectedCoinId) {
            const c = (typeof allCoins !== 'undefined' ? allCoins.find(x => x.id === selectedCoinId) : null) || { id: selectedCoinId, current_price: 0 };
            generateRecentTrades(c);
        }
    } catch {}
});
