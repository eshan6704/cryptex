        function srGetBTCPrice() {
            const btc = (typeof allCoins !== 'undefined' && allCoins.find) ? (allCoins.find(c => c.id === 'bitcoin') || allCoins[0]) : null;
            return btc?.current_price || 43000;
        }

        async function srGetCandles(force) {
            const symbol = (typeof app !== 'undefined' && app.sym) || 'BTCUSDT';
            if (!force && window.srCandles && window.srCandles.symbol === symbol && Date.now() - window.srCandles.ts < 30000) {
                return window.srCandles.data;
            }
            const hosts = ['https://api.binance.com', 'https://data-api.binance.vision'];
            for (const host of hosts) {
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 6000);
                    const r = await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=1h&limit=210`, { signal: ctrl.signal });
                    clearTimeout(tid);
                    if (!r.ok) continue;
                    const raw = await r.json();
                    const data = raw.map(c => ({ t: c[0], o: parseFloat(c[1]), h: parseFloat(c[2]), l: parseFloat(c[3]), c: parseFloat(c[4]) }));
                    window.srCandles = { data, ts: Date.now(), symbol };
                    return data;
                } catch (e) { /* try next host */ }
            }
            return null;
        }

        async function renderSRSwing() {
            const tbl = document.getElementById('srSwingTable');
            if (tbl) tbl.innerHTML = '<tr class="loading"><td colspan="5">Loading live price data from Binance...</td></tr>';

            const candles = await srGetCandles();
            if (!candles || !candles.length) {
                if (tbl) tbl.innerHTML = '<tr><td class="u76" colspan="5">Could not fetch live Binance data. Check your connection and try again.</td></tr>';
                return;
            }
            const recent = candles.slice(-72);
            const series = recent.map(c => c.c);
            const price = series[series.length - 1];

            // 5-bar fractal detection
            const swingHighs = [], swingLows = [];
            for (let i = 2; i < series.length - 2; i++) {
                const v = series[i];
                if (v > series[i-1] && v > series[i-2] && v > series[i+1] && v > series[i+2]) swingHighs.push({ i, price: v });
                if (v < series[i-1] && v < series[i-2] && v < series[i+1] && v < series[i+2]) swingLows.push({ i, price: v });
            }

            // Cluster nearby levels (within 0.5%) and count touches
            const cluster = (points) => {
                const clusters = [];
                points.forEach(pt => {
                    let found = clusters.find(c => Math.abs(c.price - pt.price) / pt.price < 0.005);
                    if (found) { found.touches++; found.price = (found.price + pt.price) / 2; }
                    else clusters.push({ price: pt.price, touches: 1 });
                });
                return clusters;
            };
            const resLevels = cluster(swingHighs).sort((a,b) => b.price - a.price);
            const supLevels = cluster(swingLows).sort((a,b) => b.price - a.price);

            const nearestRes = resLevels.filter(l => l.price > price).sort((a,b) => a.price - b.price)[0];
            const nearestSup = supLevels.filter(l => l.price < price).sort((a,b) => b.price - a.price)[0];
            const allHighs = resLevels.map(l => l.price), allLows = supLevels.map(l => l.price);
            const range = (Math.max(...allHighs, price) - Math.min(...allLows, price));

            // Structure: compare last two swing highs / lows for HH-HL or LH-LL
            let structure = 'Ranging / Mixed';
            if (swingHighs.length >= 2 && swingLows.length >= 2) {
                const hh = swingHighs[swingHighs.length-1].price > swingHighs[swingHighs.length-2].price;
                const hl = swingLows[swingLows.length-1].price > swingLows[swingLows.length-2].price;
                if (hh && hl) structure = '📈 Higher-Highs / Higher-Lows (Uptrend)';
                else if (!hh && !hl) structure = '📉 Lower-Highs / Lower-Lows (Downtrend)';
            }

            document.getElementById('srSwingRes').textContent = nearestRes ? '$' + nearestRes.price.toLocaleString('en-US',{maximumFractionDigits:0}) : 'None found';
            document.getElementById('srSwingSup').textContent = nearestSup ? '$' + nearestSup.price.toLocaleString('en-US',{maximumFractionDigits:0}) : 'None found';
            document.getElementById('srSwingRange').textContent = '$' + range.toLocaleString('en-US',{maximumFractionDigits:0});
            document.getElementById('srSwingStructure').textContent = structure;

            const strengthLabel = (t) => t >= 3 ? 'Strong' : t === 2 ? 'Medium' : 'Weak';
            const rows = [
                ...resLevels.map(l => ({ type:'Resistance', price:l.price, touches:l.touches })),
                ...supLevels.map(l => ({ type:'Support', price:l.price, touches:l.touches }))
            ].sort((a,b) => b.price - a.price);

            document.getElementById('srSwingTable').innerHTML = rows.map(r => {
                const dist = ((r.price - price) / price * 100);
                return `<tr>
                    <td style="color:${r.type==='Resistance'?'#dc2626':'#059669'};">${r.type}</td>
                    <td>$${r.price.toLocaleString('en-US',{maximumFractionDigits:0})}</td>
                    <td style="color:${dist>=0?'#dc2626':'#059669'};">${dist>=0?'+':''}${dist.toFixed(2)}%</td>
                    <td>${r.touches}</td>
                    <td>${strengthLabel(r.touches)}</td>
                </tr>`;
            }).join('') || '<tr><td colspan="5">No clear swing levels found</td></tr>';

            if (chartInstances.srSwing) chartInstances.srSwing.destroy();
            const ctx = document.getElementById('srSwingChart');
            if (ctx) {
                const pointColors = series.map((v, i) => {
                    if (swingHighs.find(s => s.i === i)) return '#dc2626';
                    if (swingLows.find(s => s.i === i)) return '#059669';
                    return 'rgba(0,0,0,0)';
                });
                const pointRadii = series.map((v, i) => (swingHighs.find(s => s.i === i) || swingLows.find(s => s.i === i)) ? 5 : 0);
                chartInstances.srSwing = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: series.map((_, i) => i),
                        datasets: [{
                            label: `${(typeof app !== 'undefined' && app.sym) || 'BTCUSDT'} Price (live, Binance 1h)`,
                            data: series,
                            borderColor: '#6b7280',
                            backgroundColor: 'rgba(0,0,0,0.02)',
                            fill: true,
                            tension: 0.2,
                            pointBackgroundColor: pointColors,
                            pointRadius: pointRadii
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: { y: { ticks: { callback: v => '$' + v.toFixed(0) } } }
                    }
                });
            }
        }

        function renderSRVolume() {
            const price = srGetBTCPrice();
            if (!window.volumeSRLevels || !window.volumeSRLevels.length) {
                document.getElementById('srVolumeTable').innerHTML = '<tr><td colspan="5">No data yet — open the BOOK page VOLUME PROFILE tab once, then come back and refresh.</td></tr>';
                return;
            }
            const levels = window.volumeSRLevels;
            const poc = levels.find(l => l.label === 'POC');
            const vah = levels.find(l => l.label === 'VAH');
            const val = levels.find(l => l.label === 'VAL');

            document.getElementById('srVolPoc').textContent = poc ? '$' + poc.price.toLocaleString('en-US',{maximumFractionDigits:0}) : '-';
            document.getElementById('srVolVah').textContent = vah ? '$' + vah.price.toLocaleString('en-US',{maximumFractionDigits:0}) : '-';
            document.getElementById('srVolVal').textContent = val ? '$' + val.price.toLocaleString('en-US',{maximumFractionDigits:0}) : '-';

            const nearest = [...levels].sort((a,b) => Math.abs(a.price-price) - Math.abs(b.price-price))[0];
            document.getElementById('srVolNearest').textContent = nearest ? `${nearest.label} @ $${nearest.price.toLocaleString('en-US',{maximumFractionDigits:0})}` : '-';

            document.getElementById('srVolumeTable').innerHTML = [...levels].sort((a,b) => b.price - a.price).map(l => `<tr>
                <td><strong>${l.label}</strong></td>
                <td>$${l.price.toLocaleString('en-US',{maximumFractionDigits:0})}</td>
                <td style="color:${l.type==='Resistance'?'#dc2626':l.type==='Support'?'#059669':'#6b7280'};">${l.type}</td>
                <td>${l.node}</td>
                <td>${l.strength}</td>
            </tr>`).join('');
        }

        function renderSROrderbook() {
            if (!window.orderbookWalls || !window.orderbookWalls.length) {
                document.getElementById('srOrderbookTable').innerHTML = '<tr><td colspan="5">No data yet — open BOOK ▸ ANALYSIS tab once to capture a live snapshot, then refresh here.</td></tr>';
                return;
            }
            const walls = window.orderbookWalls;
            const mid = walls[0].mid;
            const supports = walls.filter(w => w.side === 'Bid').sort((a,b) => b.q - a.q);
            const resistances = walls.filter(w => w.side === 'Ask').sort((a,b) => b.q - a.q);

            document.getElementById('srObSupport').textContent = supports[0] ? '$' + supports[0].p.toLocaleString('en-US',{maximumFractionDigits:2}) : 'None';
            document.getElementById('srObResistance').textContent = resistances[0] ? '$' + resistances[0].p.toLocaleString('en-US',{maximumFractionDigits:2}) : 'None';
            document.getElementById('srObCount').textContent = walls.length;

            const avgQty = walls.reduce((s,w)=>s+w.q,0) / walls.length;
            document.getElementById('srOrderbookTable').innerHTML = [...walls].sort((a,b) => b.p - a.p).map(w => {
                const dist = ((w.p - mid) / mid * 100);
                const strength = w.q > avgQty * 2 ? 'Very Strong' : w.q > avgQty * 1.3 ? 'Strong' : 'Moderate';
                return `<tr>
                    <td style="color:${w.side==='Bid'?'#059669':'#dc2626'};">${w.side==='Bid'?'Support':'Resistance'}</td>
                    <td>$${w.p.toLocaleString('en-US',{maximumFractionDigits:2})}</td>
                    <td>${w.q.toFixed(4)}</td>
                    <td style="color:${dist>=0?'#dc2626':'#059669'};">${dist>=0?'+':''}${dist.toFixed(2)}%</td>
                    <td>${strength}</td>
                </tr>`;
            }).join('');
        }

        function renderSROption() {
            if (!window.btcOptionsLevels) {
                document.getElementById('srOptionTable').innerHTML = '<tr><td colspan="4">No data yet — open the OPTIONS page once to generate levels, then refresh here.</td></tr>';
                return;
            }
            const { callWallStrike, putWallStrike, maxPainStrike, gammaFlipStrike } = window.btcOptionsLevels;

            document.getElementById('srOptCallWall').textContent = '$' + callWallStrike.toLocaleString('en-US',{maximumFractionDigits:0});
            document.getElementById('srOptPutWall').textContent = '$' + putWallStrike.toLocaleString('en-US',{maximumFractionDigits:0});
            document.getElementById('srOptMaxPain').textContent = '$' + maxPainStrike.toLocaleString('en-US',{maximumFractionDigits:0});
            document.getElementById('srOptGammaFlip').textContent = '$' + gammaFlipStrike.toLocaleString('en-US',{maximumFractionDigits:0});

            const rows = [
                { label:'Call Wall', price:callWallStrike, type:'Resistance', note:'Highest call OI strike' },
                { label:'Max Pain', price:maxPainStrike, type:'Magnet', note:'Gravitates here into expiry' },
                { label:'Gamma Flip', price:gammaFlipStrike, type:'Pivot', note:'Dealer hedging direction flips' },
                { label:'Put Wall', price:putWallStrike, type:'Support', note:'Highest put OI strike' }
            ].sort((a,b) => b.price - a.price);

            document.getElementById('srOptionTable').innerHTML = rows.map(r => `<tr>
                <td><strong>${r.label}</strong></td>
                <td>$${r.price.toLocaleString('en-US',{maximumFractionDigits:0})}</td>
                <td style="color:${r.type==='Resistance'?'#dc2626':r.type==='Support'?'#059669':'#f59e0b'};">${r.type}</td>
                <td style="font-size:11px; color:#6b7280;">${r.note}</td>
            </tr>`).join('');
        }

        async function renderSRTrend() {
            const tbl = document.getElementById('srTrendTable');
            if (tbl) tbl.innerHTML = '<tr class="loading"><td colspan="3">Loading live price data from Binance...</td></tr>';

            const candles = await srGetCandles();
            if (!candles || !candles.length) {
                if (tbl) tbl.innerHTML = '<tr><td class="u76" colspan="3">Could not fetch live Binance data. Check your connection and try again.</td></tr>';
                return;
            }
            const recent = candles.slice(-72);
            const series = recent.map(c => c.c);
            const price = series[series.length - 1];
            const swingHigh = Math.max(...recent.map(c => c.h));
            const swingLow = Math.min(...recent.map(c => c.l));
            const uptrend = series[series.length-1] > series[0];
            document.getElementById('srTrendDir').textContent = uptrend ? '📈 Uptrend (retracing from low)' : '📉 Downtrend (retracing from high)';

            const range = swingHigh - swingLow;
            const fibRatios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
            const fibLevels = fibRatios.map(r => uptrend ? swingHigh - range * r : swingLow + range * r);

            // Real moving averages from the full fetched closing-price history
            const closes = candles.map(c => c.c);
            const sma = (arr, n) => arr.length >= n ? arr.slice(-n).reduce((s,v)=>s+v,0)/n : arr.reduce((s,v)=>s+v,0)/(arr.length||1);
            const mas = [sma(closes,20), sma(closes,50), sma(closes,200)];
            let confluence = null;
            for (let i = 0; i < mas.length; i++) {
                for (let j = i+1; j < mas.length; j++) {
                    if (Math.abs(mas[i]-mas[j])/price < 0.004) { confluence = (mas[i]+mas[j])/2; }
                }
            }
            document.getElementById('srTrendMAConfluence').textContent = confluence ? '$' + confluence.toLocaleString('en-US',{maximumFractionDigits:0}) : 'No confluence found';

            // Key fib confluence = the 0.5 or 0.618 level, most commonly watched
            const keyFib = fibLevels[3]; // 0.5
            document.getElementById('srTrendFibConfluence').textContent = '$' + keyFib.toLocaleString('en-US',{maximumFractionDigits:0}) + ' (50%)';

            document.getElementById('srTrendTable').innerHTML = fibRatios.map((r, i) => {
                const lvl = fibLevels[i];
                const type = lvl > price ? 'Resistance' : 'Support';
                return `<tr>
                    <td>${(r*100).toFixed(1)}%</td>
                    <td>$${lvl.toLocaleString('en-US',{maximumFractionDigits:0})}</td>
                    <td style="color:${type==='Resistance'?'#dc2626':'#059669'};">${type}</td>
                </tr>`;
            }).join('');

            if (chartInstances.srTrend) chartInstances.srTrend.destroy();
            const ctx = document.getElementById('srTrendChart');
            if (ctx) {
                chartInstances.srTrend = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: series.map((_,i) => i),
                        datasets: [
                            { label: `${(typeof app !== 'undefined' && app.sym) || 'BTCUSDT'} Price (live)`, data: series, borderColor: '#111827', backgroundColor: 'rgba(0,0,0,0.03)', fill: true, tension: 0.2, pointRadius: 0 },
                            ...fibLevels.map((lvl, i) => ({
                                label: (fibRatios[i]*100).toFixed(1) + '%',
                                data: series.map(() => lvl),
                                borderColor: i === 3 ? '#f59e0b' : 'rgba(107,114,128,0.4)',
                                borderDash: [3,3], pointRadius: 0, fill: false
                            }))
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 9 } } } },
                        scales: { y: { ticks: { callback: v => '$' + v.toFixed(0) } } }
                    }
                });
            }
        }