        function viewTradesPage() {
            // Priority: top bar selected symbol (app.coinId) > last coin opened from market table > BTC default
            const coinId = (typeof app !== 'undefined' && app.coinId) || selectedCoinId || 'bitcoin';
            let coin = (typeof allCoins !== 'undefined' ? allCoins.find(c => c.id === coinId) : null);
            if (!coin) coin = { id: coinId, current_price: 0 }; // fallback if market data not loaded yet

            const label = document.getElementById('tradesTrackedSymbol');
            if (label) label.textContent = getBinanceSymbol(coinId).replace('USDT', '/USDT');

            generateRecentTrades(coin);
            generateWhaleOrders(coin);
        }

        function istMMSS(ts) {
            const parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Kolkata', minute: '2-digit', second: '2-digit', hour12: false
            }).formatToParts(new Date(ts));
            const get = t => parts.find(p => p.type === t).value;
            return get('minute') + ':' + get('second');
        }

        function updateTradesAnalysis() {
            const buys = tradeHistory.filter(t => t.type === 'BUY');
            const sells = tradeHistory.filter(t => t.type === 'SELL');
            const whales = tradeHistory.filter(t => t.amount >= 50000);
            const totalVol = tradeHistory.reduce((s, t) => s + t.amount, 0);
            const ratio = sells.length > 0 ? (buys.length / sells.length) : (buys.length > 0 ? Infinity : 0);

            const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.innerHTML = val; };
            setEl('tradesBuyCount', buys.length);
            setEl('tradesSellCount', sells.length);
            setEl('tradesBSRatio', ratio === Infinity ? '∞' : ratio.toFixed(2));
            setEl('tradesWhaleCount', whales.length);
            setEl('tradesTotalVol', '$' + (totalVol >= 1e6 ? (totalVol/1e6).toFixed(2)+'M' : totalVol >= 1e3 ? (totalVol/1e3).toFixed(1)+'K' : totalVol.toFixed(0)));
            const biasPct = tradeHistory.length > 0 ? (buys.length / tradeHistory.length * 100) : 50;
            const biasLabel = biasPct > 60 ? 'Buy-Heavy' : biasPct < 40 ? 'Sell-Heavy' : 'Balanced';
            const biasColor = biasPct > 60 ? '#059669' : biasPct < 40 ? '#dc2626' : '#6b7280';
            setEl('tradesTapeBias', `<span style="color:${biasColor};">${biasLabel} (${biasPct.toFixed(0)}% buy)</span>`);

            // VWAP over visible buffer
            const qtySum = tradeHistory.reduce((s, t) => s + t.qty, 0);
            const vwap = qtySum > 0 ? tradeHistory.reduce((s, t) => s + t.price * t.qty, 0) / qtySum : 0;
            setEl('tradesVWAP', vwap ? '$' + vwap.toLocaleString('en-US', {maximumFractionDigits: 2}) : '-');

            // Largest single trade
            const largest = tradeHistory.reduce((max, t) => t.amount > (max?.amount || 0) ? t : max, null);
            setEl('tradesLargest', largest ? `$${largest.amount.toLocaleString('en-US',{maximumFractionDigits:0})} (${largest.type})` : '-');

            // Net flow: buy $ - sell $ across visible buffer
            const buyVol = buys.reduce((s, t) => s + t.amount, 0);
            const sellVol = sells.reduce((s, t) => s + t.amount, 0);
            const netFlow = buyVol - sellVol;
            setEl('tradesNetFlow', `<span style="color:${netFlow >= 0 ? '#059669' : '#dc2626'};">${netFlow >= 0 ? '+' : ''}$${Math.abs(netFlow).toLocaleString('en-US',{maximumFractionDigits:0})}</span>`);

            // Trades per minute, based on buffer time span
            if (tradeHistory.length >= 2) {
                const newest = tradeHistory[0].timestamp, oldest = tradeHistory[tradeHistory.length - 1].timestamp;
                const spanMin = Math.max((newest - oldest) / 60000, 1 / 60);
                setEl('tradesPerMin', (tradeHistory.length / spanMin).toFixed(1));
            } else {
                setEl('tradesPerMin', '-');
            }

            // Price range over visible buffer
            if (tradeHistory.length > 0) {
                const prices = tradeHistory.map(t => t.price);
                const lo = Math.min(...prices), hi = Math.max(...prices);
                setEl('tradesPriceRange', `$${lo.toLocaleString('en-US',{maximumFractionDigits:2})} – $${hi.toLocaleString('en-US',{maximumFractionDigits:2})}`);
            } else {
                setEl('tradesPriceRange', '-');
            }

            // Whale net flow over the last 15 minutes
            const now = Date.now();
            const whales15 = whales.filter(t => now - t.timestamp <= 15 * 60000);
            const whaleBuy = whales15.filter(t => t.type === 'BUY').reduce((s, t) => s + t.amount, 0);
            const whaleSell = whales15.filter(t => t.type === 'SELL').reduce((s, t) => s + t.amount, 0);
            const whaleNet = whaleBuy - whaleSell;
            setEl('tradesWhaleNetFlow', `<span style="color:${whaleNet >= 0 ? '#059669' : '#dc2626'};">${whaleNet >= 0 ? '+' : ''}$${Math.abs(whaleNet).toLocaleString('en-US',{maximumFractionDigits:0})}</span>`);

            renderTradesTimelineChart();
            renderTradesCountChart();
            renderTradesValueChart();
            updateMarketPrediction();
        }

        const avgCapLabelsPlugin = {
            id: 'avgCapLabels',
            afterDatasetsDraw(chart) {
                const opts = chart.options.plugins && chart.options.plugins.avgCapLabels;
                if (!opts || !opts.cap) return;
                const { ctx, chartArea } = chart;
                const cap = opts.cap;
                const formatter = opts.formatter || (v => Math.abs(v).toFixed(0));
                ctx.save();
                ctx.font = "700 8px 'Space Mono', monospace";
                ctx.textAlign = 'center';
                chart.data.datasets.forEach((ds, dsIndex) => {
                    const meta = chart.getDatasetMeta(dsIndex);
                    if (!meta || meta.hidden) return;
                    meta.data.forEach((bar, i) => {
                        const val = ds.data[i];
                        if (val > cap) {
                            ctx.fillStyle = ds.backgroundColor || '#111827';
                            ctx.fillText(formatter(val), bar.x, chartArea.top + 9);
                        } else if (val < -cap) {
                            ctx.fillStyle = ds.backgroundColor || '#111827';
                            ctx.fillText(formatter(val), bar.x, chartArea.bottom - 3);
                        }
                    });
                });
                ctx.restore();
            }
        };

        function renderTradesTimelineChart() {
            const priceCtx = document.getElementById('tradesPriceChart');
            const deltaCtx = document.getElementById('tradesDeltaChart');
            if ((!priceCtx && !deltaCtx) || tradeHistory.length === 0) return;

            // Full 5-minute window (matches the buffer's own retention now) rather than a
            // fixed last-100-trades slice, which on a busy pair could be just a few seconds.
            const windowMs = 5 * 60000;
            const cutoff = Date.now() - windowMs;
            let windowed = tradeHistory.filter(t => t.timestamp >= cutoff);
            if (windowed.length < 2) windowed = tradeHistory.slice(0, Math.min(50, tradeHistory.length));

            // Chronological order (oldest first)
            let points = windowed.slice().reverse();

            // Downsample only if a busy pair produced a lot of ticks, so the chart stays
            // readable — but this keeps the full 5-min span rather than truncating it.
            const MAX_POINTS = 300;
            if (points.length > MAX_POINTS) {
                const step = points.length / MAX_POINTS;
                const sampled = [];
                for (let i = 0; i < MAX_POINTS; i++) sampled.push(points[Math.floor(i * step)]);
                sampled.push(points[points.length - 1]);
                points = sampled;
            }

            const priceSeries = points.map(t => t.price);
            const pointColors = points.map(t => t.type === 'BUY' ? '#059669' : '#dc2626');
            const pointRadii = points.map(t => t.amount >= 50000 ? 5 : 1);

            // mm:ss extracted from the Indian (Asia/Kolkata) clock time (shared istMMSS helper)
            const timeLabels = points.map(t => istMMSS(t.timestamp));

            // CVD trend uses its own, shorter 2-minute window (per request) — decoupled from
            // the Price chart above, which stays at the full 5-minute span. The cumulative
            // sum restarts fresh from 0 at the start of this 2-minute slice.
            const cvdWindowMs = 2 * 60000;
            const cvdCutoff = Date.now() - cvdWindowMs;
            let cvdPoints = points.filter(t => t.timestamp >= cvdCutoff);
            if (cvdPoints.length < 2) cvdPoints = points.slice(-Math.min(20, points.length));
            let cumDeltaShort = 0;
            const deltaSeries = cvdPoints.map(t => {
                cumDeltaShort += (t.type === 'BUY' ? t.amount : -t.amount);
                return cumDeltaShort;
            });
            const deltaTimeLabels = cvdPoints.map(t => istMMSS(t.timestamp));

            // Visible range floor: at least 0.5% of the current price for the Price chart.
            // Without this, a quiet window (price barely moving) auto-fits the y-axis tightly
            // around a tiny actual range, which makes ordinary noise look like a dramatic swing.
            const lastPrice = priceSeries[priceSeries.length - 1] || priceSeries[0] || 0;
            const minPriceRangePrice = lastPrice * 0.005;
            const priceLo = Math.min(...priceSeries), priceHi = Math.max(...priceSeries);
            let priceYMin = priceLo, priceYMax = priceHi;
            if ((priceYMax - priceYMin) < minPriceRangePrice) {
                const mid = (priceYMax + priceYMin) / 2;
                priceYMin = mid - minPriceRangePrice / 2;
                priceYMax = mid + minPriceRangePrice / 2;
            }

            // CVD keeps its own 1% floor (unchanged) — separate from the Price chart's floor above.
            const minPriceRangeCVD = lastPrice * 0.01;
            const deltaLo = Math.min(...deltaSeries), deltaHi = Math.max(...deltaSeries);
            let deltaYMin = deltaLo, deltaYMax = deltaHi;
            if ((deltaYMax - deltaYMin) < minPriceRangeCVD) {
                const mid = (deltaYMax + deltaYMin) / 2;
                deltaYMin = mid - minPriceRangeCVD / 2;
                deltaYMax = mid + minPriceRangeCVD / 2;
            }

            if (priceCtx) {
                if (chartInstances.tradesPrice) chartInstances.tradesPrice.destroy();
                chartInstances.tradesPrice = new Chart(priceCtx, {
                    type: 'line',
                    data: {
                        labels: timeLabels,
                        datasets: [{
                            label: 'Price',
                            data: priceSeries,
                            borderColor: '#111827',
                            backgroundColor: 'rgba(0,0,0,0.03)',
                            fill: true,
                            tension: 0.15,
                            pointBackgroundColor: pointColors,
                            pointRadius: pointRadii
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { title: { display: true, text: 'Time (mm:ss, IST) · last 5 min' }, ticks: { maxTicksLimit: 10 } },
                            y: { min: priceYMin, max: priceYMax, title: { display: true, text: 'Price ($)' }, ticks: { callback: v => '$' + v.toLocaleString('en-US',{maximumFractionDigits:0}) } }
                        }
                    }
                });
            }

            if (deltaCtx) {
                if (chartInstances.tradesDelta) chartInstances.tradesDelta.destroy();
                chartInstances.tradesDelta = new Chart(deltaCtx, {
                    type: 'line',
                    data: {
                        labels: deltaTimeLabels,
                        datasets: [{
                            label: 'Cumulative Volume Delta ($)',
                            data: deltaSeries,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245,158,11,0.08)',
                            fill: true,
                            tension: 0.15,
                            pointRadius: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { title: { display: true, text: 'Time (mm:ss, IST) · last 2 min' }, ticks: { maxTicksLimit: 10 } },
                            y: { min: deltaYMin, max: deltaYMax, title: { display: true, text: 'CVD ($)' }, ticks: { callback: v => '$' + (v/1000).toFixed(0) + 'K' } }
                        }
                    }
                });
            }
        }

        function renderTradesCountChart() {
            const ctx = document.getElementById('tradesCountChart');
            if (!ctx || tradeHistory.length === 0) return;

            const windowSec = 2 * 60; // 120 one-second buckets (2 min, per request)
            const nowSec = Math.floor(Date.now() / 1000);
            const startSec = nowSec - windowSec + 1;
            const buyCounts = new Array(windowSec).fill(0);
            const sellCounts = new Array(windowSec).fill(0);

            tradeHistory.forEach(t => {
                const sec = Math.floor(t.timestamp / 1000);
                const idx = sec - startSec;
                if (idx < 0 || idx >= windowSec) return;
                if (t.type === 'BUY') buyCounts[idx]++; else sellCounts[idx]++;
            });
            const sellCountsNeg = sellCounts.map(v => -v); // sell renders downward from zero

            // Y-axis capped at ±average (per-second, across the whole 5-min window, both
            // sides combined) rather than the actual max — a single busy second shouldn't
            // squash the rest of the window flat. Bars over the cap fill to the edge and
            // get their real count drawn there by avgCapLabelsPlugin.
            const avgCount = (buyCounts.reduce((s, v) => s + v, 0) + sellCounts.reduce((s, v) => s + v, 0)) / (windowSec * 2);
            const countCap = Math.max(avgCount, 1);

            const labels = Array.from({ length: windowSec }, (_, i) => istMMSS((startSec + i) * 1000));

            if (chartInstances.tradesCount) chartInstances.tradesCount.destroy();
            chartInstances.tradesCount = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: 'Buy Trades', data: buyCounts, backgroundColor: 'rgba(5,150,105,0.85)', borderWidth: 0, barPercentage: 1, categoryPercentage: 0.9 },
                        { label: 'Sell Trades', data: sellCountsNeg, backgroundColor: 'rgba(220,38,38,0.85)', borderWidth: 0, barPercentage: 1, categoryPercentage: 0.9 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        legend: { display: true },
                        tooltip: { callbacks: { label: item => `${item.dataset.label}: ${Math.abs(item.raw)}` } },
                        avgCapLabels: { cap: countCap, formatter: v => Math.abs(v) }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Time (mm:ss, IST) · 1s buckets · last 2 min' }, ticks: { maxTicksLimit: 12, autoSkip: true }, grid: { display: false } },
                        y: { min: -countCap, max: countCap, title: { display: true, text: 'Trade Count (Buy ↑ / Sell ↓) · capped at avg' }, ticks: { precision: 0, callback: v => Math.abs(v) } }
                    }
                },
                plugins: [avgCapLabelsPlugin]
            });
        }

        function renderTradesValueChart() {
            const ctx = document.getElementById('tradesValueChart');
            if (!ctx || tradeHistory.length === 0) return;

            const windowSec = 2 * 60; // 120 one-second buckets (2 min, per request)
            const nowSec = Math.floor(Date.now() / 1000);
            const startSec = nowSec - windowSec + 1;
            const buyValue = new Array(windowSec).fill(0);
            const sellValue = new Array(windowSec).fill(0);

            tradeHistory.forEach(t => {
                const sec = Math.floor(t.timestamp / 1000);
                const idx = sec - startSec;
                if (idx < 0 || idx >= windowSec) return;
                if (t.type === 'BUY') buyValue[idx] += t.amount; else sellValue[idx] += t.amount;
            });
            const sellValueNeg = sellValue.map(v => -v); // sell renders downward from zero

            // Same avg-cap treatment as the Count chart: a single outsized order shouldn't
            // squash every ordinary-sized bar flat.
            const avgValue = (buyValue.reduce((s, v) => s + v, 0) + sellValue.reduce((s, v) => s + v, 0)) / (windowSec * 2);
            const valueCap = Math.max(avgValue, 1);
            const fmtCapped = v => '$' + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'K' : Math.abs(v).toFixed(0));

            const labels = Array.from({ length: windowSec }, (_, i) => istMMSS((startSec + i) * 1000));

            if (chartInstances.tradesValue) chartInstances.tradesValue.destroy();
            chartInstances.tradesValue = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: 'Buy $ Value', data: buyValue, backgroundColor: 'rgba(5,150,105,0.85)', borderWidth: 0, barPercentage: 1, categoryPercentage: 0.9 },
                        { label: 'Sell $ Value', data: sellValueNeg, backgroundColor: 'rgba(220,38,38,0.85)', borderWidth: 0, barPercentage: 1, categoryPercentage: 0.9 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        legend: { display: true },
                        tooltip: { callbacks: { label: item => `${item.dataset.label}: $${Math.abs(item.raw).toLocaleString('en-US', { maximumFractionDigits: 0 })}` } },
                        avgCapLabels: { cap: valueCap, formatter: fmtCapped }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Time (mm:ss, IST) · 1s buckets · last 2 min' }, ticks: { maxTicksLimit: 12, autoSkip: true }, grid: { display: false } },
                        y: { min: -valueCap, max: valueCap, title: { display: true, text: '$ Value (Buy ↑ / Sell ↓) · capped at avg' }, ticks: { callback: v => '$' + (Math.abs(v) >= 1000 ? (Math.abs(v)/1000).toFixed(0)+'K' : Math.abs(v).toFixed(0)) } }
                    }
                },
                plugins: [avgCapLabelsPlugin]
            });
        }

        function updateMarketPrediction() {
            const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.innerHTML = val; };
            if (tradeHistory.length < 10) {
                setEl('predMomentum', '-'); setEl('predMomentumValue', '-'); setEl('predCVDTrend', '-');
                setEl('predAggression', '-'); setEl('predCountTrend', '-'); setEl('predValueTrend', '-');
                setEl('predBias', 'Insufficient data');
                setEl('predReasoning', 'Waiting for at least 10 trades in the visible tape before signalling.');
                return;
            }

            const now = Date.now();
            const last1m = tradeHistory.filter(t => now - t.timestamp <= 60000);
            const prior4m = tradeHistory.filter(t => now - t.timestamp > 60000 && now - t.timestamp <= 5 * 60000);

            // 1a) Momentum — Count: is buy-side *participation* (trade count) accelerating?
            const pctBuyCount = arr => arr.length ? (arr.filter(t => t.type === 'BUY').length / arr.length * 100) : null;
            const last1mBuyPct = pctBuyCount(last1m);
            const prior4mBuyPct = pctBuyCount(prior4m);
            let momentumLabel = 'Flat', momentumColor = '#6b7280', momentumSign = 0;
            if (last1mBuyPct !== null && prior4mBuyPct !== null) {
                const diff = last1mBuyPct - prior4mBuyPct;
                momentumSign = diff > 8 ? 1 : diff < -8 ? -1 : 0;
                if (diff > 8) { momentumLabel = `Accelerating Buying (+${diff.toFixed(0)}pp)`; momentumColor = '#059669'; }
                else if (diff < -8) { momentumLabel = `Accelerating Selling (${diff.toFixed(0)}pp)`; momentumColor = '#dc2626'; }
                else { momentumLabel = `Stable (${diff >= 0 ? '+' : ''}${diff.toFixed(0)}pp)`; }
            }
            setEl('predMomentum', `<span style="color:${momentumColor};">${momentumLabel}</span>`);

            // 1b) Momentum — $ Value: is buy-side *dollar volume share* accelerating? (a few large
            // orders can shift this even when trade counts look flat, which is the whole point
            // of tracking it separately from the count-based version above)
            const pctBuyValue = arr => {
                const total = arr.reduce((s, t) => s + t.amount, 0);
                if (!total) return null;
                const buyVal = arr.filter(t => t.type === 'BUY').reduce((s, t) => s + t.amount, 0);
                return buyVal / total * 100;
            };
            const last1mBuyValPct = pctBuyValue(last1m);
            const prior4mBuyValPct = pctBuyValue(prior4m);
            let momentumValueLabel = 'Flat', momentumValueColor = '#6b7280', momentumValueSign = 0;
            if (last1mBuyValPct !== null && prior4mBuyValPct !== null) {
                const diffV = last1mBuyValPct - prior4mBuyValPct;
                momentumValueSign = diffV > 8 ? 1 : diffV < -8 ? -1 : 0;
                if (diffV > 8) { momentumValueLabel = `Accelerating Buying $ (+${diffV.toFixed(0)}pp)`; momentumValueColor = '#059669'; }
                else if (diffV < -8) { momentumValueLabel = `Accelerating Selling $ (${diffV.toFixed(0)}pp)`; momentumValueColor = '#dc2626'; }
                else { momentumValueLabel = `Stable (${diffV >= 0 ? '+' : ''}${diffV.toFixed(0)}pp)`; }
            }
            setEl('predMomentumValue', `<span style="color:${momentumValueColor};">${momentumValueLabel}</span>`);

            // 2) CVD trend: compare cumulative delta of the first half vs second half of the window
            const windowed = tradeHistory.filter(t => now - t.timestamp <= 5 * 60000).slice().reverse(); // oldest first
            let cvdLabel = 'Flat', cvdColor = '#6b7280', cvdSlopeSign = 0;
            if (windowed.length >= 4) {
                const mid = Math.floor(windowed.length / 2);
                const deltaOf = arr => arr.reduce((s, t) => s + (t.type === 'BUY' ? t.amount : -t.amount), 0);
                const firstHalfDelta = deltaOf(windowed.slice(0, mid));
                const secondHalfDelta = deltaOf(windowed.slice(mid));
                const slope = secondHalfDelta - firstHalfDelta;
                cvdSlopeSign = slope > 0 ? 1 : slope < 0 ? -1 : 0;
                const slopeFmt = '$' + Math.abs(slope).toLocaleString('en-US', { maximumFractionDigits: 0 });
                if (slope > 0) { cvdLabel = `Rising (+${slopeFmt})`; cvdColor = '#059669'; }
                else if (slope < 0) { cvdLabel = `Falling (-${slopeFmt})`; cvdColor = '#dc2626'; }
            }
            setEl('predCVDTrend', `<span style="color:${cvdColor};">${cvdLabel}</span>`);

            // 3) Aggression skew: average $ size of buy trades vs sell trades (larger side = more conviction)
            const buys5 = windowed.filter(t => t.type === 'BUY');
            const sells5 = windowed.filter(t => t.type === 'SELL');
            const avgBuySize = buys5.length ? buys5.reduce((s, t) => s + t.amount, 0) / buys5.length : 0;
            const avgSellSize = sells5.length ? sells5.reduce((s, t) => s + t.amount, 0) / sells5.length : 0;
            let aggLabel = 'Balanced', aggColor = '#6b7280', aggSign = 0;
            if (avgBuySize > 0 && avgSellSize > 0) {
                const ratio = avgBuySize / avgSellSize;
                if (ratio > 1.25) { aggLabel = `Buyers more aggressive (${ratio.toFixed(2)}x)`; aggColor = '#059669'; aggSign = 1; }
                else if (ratio < 0.8) { aggLabel = `Sellers more aggressive (${(1/ratio).toFixed(2)}x)`; aggColor = '#dc2626'; aggSign = -1; }
                else { aggLabel = `Balanced (${ratio.toFixed(2)}x)`; }
            }
            setEl('predAggression', `<span style="color:${aggColor};">${aggLabel}</span>`);

            // 4a) Trade-count trend: is overall tape activity (count/min) speeding up or slowing down?
            let countTrendLabel = 'Steady', countTrendColor = '#6b7280', countSign = 0;
            let firstHalf = [], secondHalf = [];
            if (windowed.length >= 4) {
                const mid = Math.floor(windowed.length / 2);
                firstHalf = windowed.slice(0, mid); secondHalf = windowed.slice(mid);
                const firstSpanMin = Math.max((firstHalf[firstHalf.length - 1].timestamp - firstHalf[0].timestamp) / 60000, 1 / 60);
                const secondSpanMin = Math.max((secondHalf[secondHalf.length - 1].timestamp - secondHalf[0].timestamp) / 60000, 1 / 60);
                const firstRate = firstHalf.length / firstSpanMin;
                const secondRate = secondHalf.length / secondSpanMin;
                const pctChange = firstRate > 0 ? ((secondRate - firstRate) / firstRate * 100) : 0;
                countSign = pctChange > 15 ? 1 : pctChange < -15 ? -1 : 0;
                if (pctChange > 15) { countTrendLabel = `Picking up (+${pctChange.toFixed(0)}%)`; countTrendColor = '#059669'; }
                else if (pctChange < -15) { countTrendLabel = `Cooling off (${pctChange.toFixed(0)}%)`; countTrendColor = '#dc2626'; }
                else { countTrendLabel = `Steady (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(0)}%)`; }
            }
            setEl('predCountTrend', `<span style="color:${countTrendColor};">${countTrendLabel}</span>`);

            // 4b) $ Value trend: is $ volume/min speeding up or slowing down? (can diverge from
            // the count trend when trade sizes themselves are growing/shrinking)
            let valueTrendLabel = 'Steady', valueTrendColor = '#6b7280', valueTrendSign = 0;
            if (firstHalf.length && secondHalf.length) {
                const firstSpanMin = Math.max((firstHalf[firstHalf.length - 1].timestamp - firstHalf[0].timestamp) / 60000, 1 / 60);
                const secondSpanMin = Math.max((secondHalf[secondHalf.length - 1].timestamp - secondHalf[0].timestamp) / 60000, 1 / 60);
                const firstValRate = firstHalf.reduce((s, t) => s + t.amount, 0) / firstSpanMin;
                const secondValRate = secondHalf.reduce((s, t) => s + t.amount, 0) / secondSpanMin;
                const pctValChange = firstValRate > 0 ? ((secondValRate - firstValRate) / firstValRate * 100) : 0;
                valueTrendSign = pctValChange > 15 ? 1 : pctValChange < -15 ? -1 : 0;
                if (pctValChange > 15) { valueTrendLabel = `Picking up (+${pctValChange.toFixed(0)}%)`; valueTrendColor = '#059669'; }
                else if (pctValChange < -15) { valueTrendLabel = `Cooling off (${pctValChange.toFixed(0)}%)`; valueTrendColor = '#dc2626'; }
                else { valueTrendLabel = `Steady (${pctValChange >= 0 ? '+' : ''}${pctValChange.toFixed(0)}%)`; }
            }
            setEl('predValueTrend', `<span style="color:${valueTrendColor};">${valueTrendLabel}</span>`);

            // Composite bias: sum simple signed votes across count- and value-based signals
            const votes = momentumSign + momentumValueSign + cvdSlopeSign + aggSign;
            let biasLabel = 'Neutral', biasColor = '#6b7280', reasoning = [];

            if (momentumSign !== 0) reasoning.push(`buy-side trade *count* is ${momentumSign > 0 ? 'accelerating' : 'fading'} vs the prior 4 minutes`);
            if (momentumValueSign !== 0) reasoning.push(`buy-side $ *value* share is ${momentumValueSign > 0 ? 'accelerating' : 'fading'} vs the prior 4 minutes`);
            if (cvdSlopeSign !== 0) reasoning.push(`cumulative volume delta is ${cvdSlopeSign > 0 ? 'rising' : 'falling'} over the window`);
            if (aggSign !== 0) reasoning.push(`${aggSign > 0 ? 'buyers' : 'sellers'} are placing larger average orders`);
            if (countSign !== 0) reasoning.push(`trade frequency (count/min) is ${countSign > 0 ? 'picking up' : 'cooling off'}`);
            if (valueTrendSign !== 0) reasoning.push(`$ volume/min is ${valueTrendSign > 0 ? 'picking up' : 'cooling off'}`);

            if (votes >= 2) { biasLabel = '🟢 Bullish lean'; biasColor = '#059669'; }
            else if (votes <= -2) { biasLabel = '🔴 Bearish lean'; biasColor = '#dc2626'; }
            else if (votes === 1) { biasLabel = '🟡 Mild bullish lean'; biasColor = '#65a30d'; }
            else if (votes === -1) { biasLabel = '🟡 Mild bearish lean'; biasColor = '#ea580c'; }
            else { biasLabel = '⚪ Neutral / no clear edge'; biasColor = '#6b7280'; }

            setEl('predBias', `<span style="color:${biasColor};">${biasLabel}</span>`);
            setEl('predReasoning', reasoning.length
                ? 'Based on the visible tape: ' + reasoning.join('; ') + '.'
                : 'No single factor stands out — count, $ value, CVD slope, and order aggression are all roughly balanced right now.');
        }

        function renderWhaleTimelineChart(whaleOrders, dayHigh, dayLow, coinSymbol) {
            const ctx = document.getElementById('whaleTimelineChart');
            if (!ctx) return;
            if (!whaleOrders || whaleOrders.length === 0) {
                if (chartInstances.whaleTimeline) { chartInstances.whaleTimeline.destroy(); chartInstances.whaleTimeline = null; }
                return;
            }

            const symKey = coinSymbol || '_default';
            if (!_whaleAxisCache[symKey] && dayHigh && dayLow && dayHigh > dayLow) {
                const pad = (dayHigh - dayLow) * 0.03;
                _whaleAxisCache[symKey] = { min: dayLow - pad, max: dayHigh + pad };
            }
            const axisRange = _whaleAxisCache[symKey] || null;

            // Chronological order (oldest first)
            const points = whaleOrders.slice().reverse();

            // mm:ss extracted from the Indian (Asia/Kolkata) clock time (shared istMMSS helper)

            const buyPoints = [], sellPoints = [];
            points.forEach(o => {
                const pt = { x: o.timestamp, y: o.price, qty: o.qty, mmss: istMMSS(o.timestamp) };
                (o.type === 'BUY' ? buyPoints : sellPoints).push(pt);
            });

            if (chartInstances.whaleTimeline) chartInstances.whaleTimeline.destroy();
            chartInstances.whaleTimeline = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [
                        {
                            label: 'Buy',
                            data: buyPoints,
                            backgroundColor: 'rgba(5,150,105,0.9)',
                            borderColor: 'rgba(5,150,105,1)',
                            pointStyle: 'star',
                            radius: 7,
                            hoverRadius: 9
                        },
                        {
                            label: 'Sell',
                            data: sellPoints,
                            backgroundColor: 'rgba(220,38,38,0.9)',
                            borderColor: 'rgba(220,38,38,1)',
                            pointStyle: 'star',
                            radius: 7,
                            hoverRadius: 9
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    plugins: {
                        legend: { display: true },
                        datalabels: {
                            color: '#111827',
                            anchor: 'end',
                            align: 'top',
                            offset: 4,
                            font: { size: 9, weight: '600' },
                            formatter: v => v.qty.toFixed(1)
                        },
                        tooltip: {
                            callbacks: {
                                label: item => {
                                    const p = item.raw;
                                    return `${item.dataset.label} · qty ${p.qty.toFixed(1)} @ $${p.y.toFixed(2)} · ${p.mmss} IST`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'linear',
                            title: { display: true, text: 'Time (mm:ss, IST) · rolling 15 min' },
                            min: Date.now() - 15 * 60000,
                            max: Date.now(),
                            ticks: { callback: val => istMMSS(val) }
                        },
                        y: {
                            title: { display: true, text: 'Price ($) · today\'s range' },
                            ...(axisRange ? { min: axisRange.min, max: axisRange.max } : {}),
                            ticks: { callback: v => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) }
                        }
                    }
                },
                plugins: [ChartDataLabels]
            });
        }

        function updateCoinChart(coin) {
            if (chartInstances.coinPrice) chartInstances.coinPrice.destroy();
            const ctx = document.getElementById('coinPriceChart');
            if (ctx) {
                const prices = Array.from({length: 30}, () => coin.current_price * (1 + (Math.random() - 0.5) * 0.05));

                chartInstances.coinPrice = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: Array.from({length: 30}, (_, i) => i + 'h'),
                        datasets: [{
                            label: coin.symbol.toUpperCase(),
                            data: prices,
                            borderColor: '#d0d5de',
                            backgroundColor: 'rgba(29, 161, 242, 0.1)',
                            tension: 0.3,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: { y: { grid: { color: 'rgba(0, 0, 0, 0.05)' } } }
                    }
                });
            }
        }

        function generateRecentTrades(coin) {
            selectedCoinId = coin.id;

            // Fresh start for the new coin — otherwise the previous coin's trades
            // would still be sitting in tradeHistory and get mixed in with the new
            // coin's feed (wrong prices/whale amounts shown together).
            tradeHistory = [];
            seenTradeKeys.clear();
            updateRecentTradesDisplay(coin);
            updateWhaleOrdersDisplay(coin);

            // Close existing WebSockets if any
            if (tradeWebSocket) {
                tradeWebSocket.close();
                tradeWebSocket = null;
            }
            if (bybitTradeWebSocket) {
                bybitTradeWebSocket.close();
                bybitTradeWebSocket = null;
            }
            if (okxTradeWebSocket) {
                okxTradeWebSocket.close();
                okxTradeWebSocket = null;
            }
            if (tradeRestPollInterval) {
                clearInterval(tradeRestPollInterval);
                tradeRestPollInterval = null;
            }

            // Get exchange symbols (e.g., bitcoin -> BTCUSDT — Binance and Bybit spot use the same ticker)
            const binanceSymbol = getBinanceSymbol(coin.id).toLowerCase();
            const bybitSymbol = getBinanceSymbol(coin.id).toUpperCase();
            const okxSymbol = bybitSymbol.replace('USDT', '-USDT'); // e.g. PAXGUSDT -> PAXG-USDT

            // Generation token: increments on every call to this function (coin switch or
            // reconnect entry point). Reconnect callbacks below capture their own `myGen`
            // and bail out if a newer generation has since started — otherwise a slow
            // reconnect timer from a coin the user has already left could resurrect a
            // socket for the wrong symbol.
            const myGen = ++tradeSocketGen;

            // ── Source 1: Binance (live) ──
            const wsUrl = `wss://data-stream.binance.vision/ws/${binanceSymbol}@aggTrade`;

            function connectBinanceTrade() {
                if (myGen !== tradeSocketGen) return;
                tradeWebSocket = new WebSocket(wsUrl);

                tradeWebSocket.onopen = () => { tradeReconnAttempts.binance = 0; };

                tradeWebSocket.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    const trade = {
                        time: new Date(data.T).toLocaleTimeString() + '.' + String(data.T % 1000).padStart(3, '0'),
                        type: data.m ? 'SELL' : 'BUY',  // m=true means maker was seller (market sell)
                        price: parseFloat(data.p),
                        qty: parseFloat(data.q),
                        amount: parseFloat(data.p) * parseFloat(data.q),
                        timestamp: data.T,
                        exchange: 'Binance',
                        tradeId: data.a
                    };
                    pushTrade(trade, coin);
                };

                tradeWebSocket.onerror = () => {
                    console.log('Binance WebSocket error, falling back to mock data');
                    updateRecentTradesDisplay(coin);
                    updateWhaleOrdersDisplay(coin);
                };

                // No reconnect happened here before — a closed socket (network drop, tab
                // sleep/resume, ISP hiccup) just went dead for the rest of the session.
                // Now it retries with exponential backoff (capped 30s), same pattern as
                // the main ticker socket, and stands down cleanly if superseded by a
                // coin switch or the browser going offline (the 'online' listener above
                // re-triggers immediately once connectivity returns).
                tradeWebSocket.onclose = () => {
                    if (myGen !== tradeSocketGen) return;
                    if (!navigator.onLine) return;
                    tradeReconnAttempts.binance++;
                    setTimeout(() => connectBinanceTrade(), tradeBackoffMs(tradeReconnAttempts.binance));
                };
            }
            connectBinanceTrade();

            // ── Source 2: Bybit (public spot trade stream, no API key required) ──
            function connectBybitTrade() {
                if (myGen !== tradeSocketGen) return;
                bybitTradeWebSocket = new WebSocket('wss://stream.bybit.com/v5/public/spot');

                bybitTradeWebSocket.onopen = () => {
                    tradeReconnAttempts.bybit = 0;
                    bybitTradeWebSocket.send(JSON.stringify({ op: 'subscribe', args: [`publicTrade.${bybitSymbol}`] }));
                };

                bybitTradeWebSocket.onmessage = (event) => {
                    const msg = JSON.parse(event.data);
                    if (!msg.topic || !msg.topic.startsWith('publicTrade.') || !Array.isArray(msg.data)) return;

                    for (const t of msg.data) {
                        const price = parseFloat(t.p);
                        const qty = parseFloat(t.v);
                        const trade = {
                            time: new Date(t.T).toLocaleTimeString() + '.' + String(t.T % 1000).padStart(3, '0'),
                            type: t.S === 'Sell' ? 'SELL' : 'BUY',
                            price: price,
                            qty: qty,
                            amount: price * qty,
                            timestamp: t.T,
                            exchange: 'Bybit',
                            tradeId: t.i
                        };
                        pushTrade(trade, coin);
                    }
                };

                bybitTradeWebSocket.onerror = () => {
                    console.log('Bybit WebSocket error — continuing with other feeds');
                };

                bybitTradeWebSocket.onclose = () => {
                    if (myGen !== tradeSocketGen) return;
                    if (!navigator.onLine) return;
                    tradeReconnAttempts.bybit++;
                    setTimeout(() => connectBybitTrade(), tradeBackoffMs(tradeReconnAttempts.bybit));
                };
            }
            connectBybitTrade();

            // ── Source 3: OKX (public spot trade stream) — third source, mainly helps
            // thinner pairs like PAXG where Binance/Bybit alone can look too quiet ──
            function connectOkxTrade() {
                if (myGen !== tradeSocketGen) return;
                okxTradeWebSocket = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');

                okxTradeWebSocket.onopen = () => {
                    tradeReconnAttempts.okx = 0;
                    okxTradeWebSocket.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'trades', instId: okxSymbol }] }));
                };

                okxTradeWebSocket.onclose = () => {
                    if (myGen !== tradeSocketGen) return;
                    if (!navigator.onLine) return;
                    tradeReconnAttempts.okx++;
                    setTimeout(() => connectOkxTrade(), tradeBackoffMs(tradeReconnAttempts.okx));
                };

            okxTradeWebSocket.onmessage = (event) => {
                let msg;
                try { msg = JSON.parse(event.data); } catch { return; }
                if (!msg.arg || msg.arg.channel !== 'trades' || !Array.isArray(msg.data)) return;

                for (const t of msg.data) {
                    const price = parseFloat(t.px);
                    const qty = parseFloat(t.sz);
                    const ts = parseInt(t.ts, 10);
                    const trade = {
                        time: new Date(ts).toLocaleTimeString() + '.' + String(ts % 1000).padStart(3, '0'),
                        type: t.side === 'sell' ? 'SELL' : 'BUY',
                        price: price,
                        qty: qty,
                        amount: price * qty,
                        timestamp: ts,
                        exchange: 'OKX',
                        tradeId: t.tradeId
                    };
                    pushTrade(trade, coin);
                }
            };

                okxTradeWebSocket.onerror = () => {
                    console.log('OKX WebSocket error — continuing with other feeds');
                };
            }
            connectOkxTrade();

            // ── REST backstop: seed immediately with the latest trades so the tape
            // isn't empty while waiting for the first live tick, and keep polling in
            // case a thin pair (e.g. PAXG) goes quiet on all three sockets ──
            seedRecentTradesREST(coin, binanceSymbol);
            tradeRestPollInterval = setInterval(() => seedRecentTradesREST(coin, binanceSymbol), 5000);
        }

        async function seedRecentTradesREST(coin, binanceSymbol) {
            try {
                const r = await fetchWithTimeout(`https://data-api.binance.vision/api/v3/trades?symbol=${binanceSymbol.toUpperCase()}&limit=50`, {}, 8000);
                if (!r.ok) return;
                const data = await r.json();
                data.forEach(t => {
                    pushTrade({
                        time: new Date(t.time).toLocaleTimeString() + '.' + String(t.time % 1000).padStart(3, '0'),
                        type: t.isBuyerMaker ? 'SELL' : 'BUY',
                        price: parseFloat(t.price),
                        qty: parseFloat(t.qty),
                        amount: parseFloat(t.price) * parseFloat(t.qty),
                        timestamp: t.time,
                        exchange: 'Binance',
                        tradeId: 'rest' + t.id
                    }, coin);
                });
            } catch (e) { console.log('Binance REST trade seed failed', e); }
        }

        function pushTrade(trade, coin) {
            // De-dupe: the REST backstop and live sockets can both deliver the same
            // trade, so key on exchange+id (or exchange+time+price+qty if no id).
            const key = `${trade.exchange}|${trade.tradeId ?? (trade.timestamp + '-' + trade.price + '-' + trade.qty)}`;
            if (seenTradeKeys.has(key)) return;
            seenTradeKeys.add(key);
            if (seenTradeKeys.size > 20000) seenTradeKeys.clear(); // don't let this grow unbounded over a long session

            tradeHistory.unshift(trade);  // Add to front (newest first)
            // Time-based retention: keep the last 5 minutes of trades rather than a fixed
            // count — on a busy pair, 1000 trades can span only a few seconds, which made
            // the visible price range (and this chart) look far too narrow/jumpy.
            const cutoff = trade.timestamp - 5 * 60000;
            while (tradeHistory.length && tradeHistory[tradeHistory.length - 1].timestamp < cutoff) tradeHistory.pop();
            if (tradeHistory.length > 5000) tradeHistory.length = 5000; // safety cap for extremely busy pairs

            // Keep newest-first ordering even though two sockets interleave asynchronously
            tradeHistory.sort((a, b) => b.timestamp - a.timestamp);

            updateRecentTradesDisplay(coin);
            updateWhaleOrdersDisplay(coin);
        }

        function getBinanceSymbol(coinId) {
            // Prefer deriving the symbol straight from the live coin list — this covers
            // every coin available in the market table/search (BTC, PAXG, ETH, and
            // anything else), instead of silently falling back to BTC for anything
            // outside the small hardcoded map below.
            const source = (typeof allCoins !== 'undefined' && allCoins && allCoins.length) ? allCoins
                          : (typeof app !== 'undefined' && app.coins && app.coins.length) ? app.coins
                          : null;
            const coin = source ? source.find(c => c.id === coinId) : null;
            if (coin && coin.symbol) return coin.symbol.toUpperCase() + 'USDT';

            // Fallback map only used if the coin list hasn't loaded yet
            const map = {
                'bitcoin': 'BTCUSDT',
                'ethereum': 'ETHUSDT',
                'pax-gold': 'PAXGUSDT',
                'solana': 'SOLUSDT',
                'cardano': 'ADAUSDT',
                'polkadot': 'DOTUSDT',
                'ripple': 'XRPUSDT',
                'litecoin': 'LTCUSDT',
                'dogecoin': 'DOGEUSDT'
            };
            return map[coinId] || 'BTCUSDT';
        }

        function updateRecentTradesDisplay(coin) {
            let html = '';

            // Display last 10 trades from history (most recent first)
            const recentTrades = tradeHistory.slice(0, 25);

            if (recentTrades.length === 0) {
                document.getElementById('coinTrades').innerHTML = '<tr class="loading"><td class="u-c28" colspan="7">Waiting for live trades...</td></tr>';
                return;
            }

            for (let trade of recentTrades) {
                const isWhale = trade.amount >= 50000;
                const whaleIndicator = isWhale ? '🐋 WHALE' : '—';
                const rowStyle = isWhale ? 'background: rgba(255, 215, 0, 0.15); font-weight: 600;' : '';

                html += `<tr style="${rowStyle}">
                    <td style="font-family: monospace; font-size: 10px; color: #666;">${trade.time}</td>
                    <td style="color: ${trade.type === 'BUY' ? '#059669' : '#dc2626'}; font-weight: 700; width: 50px; text-transform: uppercase;">${trade.type}</td>
                    <td style="text-align: right; font-weight: 500;">$${trade.price.toFixed(2)}</td>
                    <td style="text-align: right;">${trade.qty.toFixed(8)}</td>
                    <td style="color: ${isWhale ? '#2563eb' : '#111827'}; font-weight: ${isWhale ? '700' : '400'}; text-align: right;">$${trade.amount.toFixed(2)}</td>
                    <td style="font-size: 10px; color: #6b7280;">${trade.exchange || 'Binance'}</td>
                    <td style="color: ${isWhale ? '#2563eb' : '#9ca3af'}; text-align: center; font-size: 11px;">${whaleIndicator}</td>
                </tr>`;
            }

            document.getElementById('coinTrades').innerHTML = html || '<tr class="loading"><td colspan="7">No trades</td></tr>';
        }

        function generateWhaleOrders(coin) {
            // Clear existing interval
            if (whaleOrderInterval) clearInterval(whaleOrderInterval);

            window.liveWhaleTrades = [];

            // Initial render
            updateWhaleOrdersDisplay(coin);

            // Update every 1 second so the "age" column and 15-min window keep ticking
            // (and any REST-backstop trades show up promptly) even between incoming trades
            whaleOrderInterval = setInterval(() => {
                updateWhaleOrdersDisplay(coin);
            }, 1000);
        }

        function updateWhaleOrdersDisplay(coin) {
            let html = '';
            const now = Date.now();
            const whaleThreshold = 50000;      // consider >$50,000 a whale order
            const memoryMs = 15 * 60000;       // 15-minute rolling memory
            const maxRows = 50;                // merged table shows up to 50 rows

            // Single merged whale feed — replaces the old separate "large trades" and
            // "whale orders" tables. Filters by both $ threshold and 15-min recency.
            const whaleOrders = tradeHistory
                .filter(trade => trade.amount >= whaleThreshold && (now - trade.timestamp) <= memoryMs)
                .map(trade => {
                    const age = now - trade.timestamp;
                    const minutesAgo = Math.floor(age / 60000);
                    const secondsAgo = Math.floor((age % 60000) / 1000);
                    return {
                        age: minutesAgo + 'm ' + secondsAgo + 's',
                        type: trade.type,
                        price: trade.price,
                        qty: trade.qty,
                        amount: trade.amount,
                        exchange: trade.exchange || 'Binance',
                        status: 'Filled',
                        timestamp: trade.timestamp
                    };
                })
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, maxRows);

            renderWhaleTimelineChart(whaleOrders, coin.high_24h, coin.low_24h, coin.symbol);

            if (whaleOrders.length === 0) {
                document.getElementById('whaleOrdersTable').innerHTML = '<tr class="loading"><td class="u-c28" colspan="7">Tracking whale orders (last 15 min)...</td></tr>';
                if (typeof updateTradesAnalysis === 'function') updateTradesAnalysis();
                return;
            }

            for (let order of whaleOrders) {
                const statusColor = '#059669';

                html += `<tr style="background: rgba(255, 215, 0, 0.1);">
                    <td style="font-family: monospace; font-size: 11px; color: #9ca3af;">${order.age}</td>
                    <td style="color: ${order.type === 'BUY' ? '#059669' : '#dc2626'}; font-weight: 700; width: 60px;">${order.type}</td>
                    <td style="text-align: right; font-weight: 600;">$${order.price.toFixed(2)}</td>
                    <td style="text-align: right; font-weight: 700; color: #2563eb;">${order.qty.toFixed(4)}</td>
                    <td style="text-align: right; font-weight: 700; color: #2563eb;">$${order.amount.toFixed(0)}</td>
                    <td style="color: #2563eb; font-weight: 700;">${order.exchange}</td>
                    <td style="color: ${statusColor}; font-weight: 600;">${order.status}</td>
                </tr>`;
            }

            document.getElementById('whaleOrdersTable').innerHTML = html;
            if (typeof updateTradesAnalysis === 'function') updateTradesAnalysis();
        }