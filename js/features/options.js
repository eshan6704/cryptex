        function updateBTCOptions() {
            const btc = allCoins.find(c => c.id === 'bitcoin') || allCoins[0];
            const btcPrice = btc?.current_price || 43000;

            document.getElementById('btcPrice').textContent = `$${btcPrice.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
            document.getElementById('btcIVRank').textContent = Math.floor(Math.random() * 100) + '%';
            document.getElementById('btcPCRatio').textContent = (Math.random() * 0.8 + 0.6).toFixed(2);
            document.getElementById('btcMaxPain').textContent = `$${(btcPrice * (1 + (Math.random() - 0.5) * 0.05)).toLocaleString('en-US', {maximumFractionDigits: 0})}`;
            document.getElementById('btcTotalOI').textContent = '$' + Math.floor(Math.random() * 5 + 10) + 'B';
            document.getElementById('btcIVPct').textContent = Math.floor(Math.random() * 100) + '%';

            generateBTCOptionsChain(btcPrice);
            updateGreeksHeatmap(btcPrice);
            updateIVSkew(btcPrice);
            updateOIChart(btcPrice);
        }

        function premiumBreakdown(price, intrinsic) {
            if (!price) return '';
            const tv = price - intrinsic;
            const tvPct = price > 0 ? (tv / price * 100) : 0;
            return '<br><span style="font-size:9.5px;font-weight:400;color:#9ca3af;">I $' + intrinsic.toFixed(0) + ' &middot; T $' + tv.toFixed(0) + ' (' + tvPct.toFixed(0) + '%)</span>';
        }

        function generateBTCOptionsChain(btcPrice) {
            // Fetch LIVE options data from Deribit API
            document.getElementById('btcOptionsChain').innerHTML = '<tr class="loading"><td class="u-c28" colspan="9">Loading live options from Deribit...</td></tr>';

            // Fetch from Deribit public API
            fetch('https://www.deribit.com/api/v2/public/get_instruments?currency=BTC&kind=option&expired=false')
                .then(res => res.json())
                .then(data => {
                    if (!data.result || data.result.length === 0) {
                        document.getElementById('btcOptionsChain').innerHTML = '<tr class="loading"><td class="u-c28" colspan="9">No options data available</td></tr>';
                        return;
                    }

                    const now = new Date();
                    const sel = document.getElementById('optionsExpiry');

                    // Populate the dropdown with the venue's actual expiry dates (once per
                    // page load) instead of a generic DTE offset, since Deribit lists real
                    // daily/weekly/monthly BTC option expiries.
                    if (!sel.dataset.populated) {
                        const uniqueExpiries = [...new Set(data.result.map(o => o.expiration_timestamp))]
                            .filter(ts => ts > now.getTime())
                            .sort((a, b) => a - b);

                        sel.innerHTML = uniqueExpiries.map(ts => {
                            const d = new Date(ts);
                            const dte = Math.max(0, Math.round((ts - now.getTime()) / 86400000));
                            const dateLabel = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
                            const timeLabel = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
                            return `<option value="${ts}">${dateLabel} ${timeLabel} UTC (${dte}DTE)</option>`;
                        }).join('');

                        // Default selection: the earliest expiry still in the future. If
                        // today's expiry time hasn't passed yet, that IS today's expiry;
                        // once it has passed, the earliest remaining one is tomorrow's —
                        // this one rule covers both cases without hardcoding a cutoff hour.
                        if (uniqueExpiries.length) sel.value = String(uniqueExpiries[0]);
                        sel.dataset.populated = '1';
                    }

                    const expiryTs = parseInt(sel.value) || (data.result[0] && data.result[0].expiration_timestamp);
                    const expiryDate = new Date(expiryTs);
                    document.getElementById('optionsDTELabel').textContent =
                        expiryDate.toDateString() + ' ' +
                        expiryDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';

                    // Options for the exact selected expiry
                    const allOptions = data.result
                        .filter(opt => opt.expiration_timestamp === expiryTs)
                        .sort((a, b) => a.strike - b.strike);

                    if (allOptions.length === 0) {
                        document.getElementById('btcOptionsChain').innerHTML = '<tr class="loading"><td class="u-c28" colspan="9">No options for selected expiry</td></tr>';
                        return;
                    }

                    // Get unique strikes and find ATM
                    const uniqueStrikes = [...new Set(allOptions.map(o => o.strike))].sort((a, b) => a - b);

                    // 11 strikes total: 5 below ATM + ATM + 5 above ATM. ATM = the
                    // listed strike closest to spot (not just the first one >= spot).
                    const atmIndex = uniqueStrikes.reduce((closest, s, i) =>
                        Math.abs(s - btcPrice) < Math.abs(uniqueStrikes[closest] - btcPrice) ? i : closest, 0);
                    const startIdx = Math.max(0, atmIndex - 5);
                    const endIdx = Math.min(uniqueStrikes.length, atmIndex + 6);
                    const selectedStrikes = uniqueStrikes.slice(startIdx, endIdx);

                    if (selectedStrikes.length === 0) {
                        document.getElementById('btcOptionsChain').innerHTML = '<tr class="loading"><td class="u-c28" colspan="9">No strikes available for this expiry</td></tr>';
                        return;
                    }

                    // Get instrument names for selected strikes
                    const selectedInstruments = [];
                    for (const strike of selectedStrikes) {
                        const call = allOptions.find(o => o.strike === strike && o.option_type === 'call');
                        const put = allOptions.find(o => o.strike === strike && o.option_type === 'put');
                        if (call) selectedInstruments.push(call.instrument_name);
                        if (put) selectedInstruments.push(put.instrument_name);
                    }

                    // Fetch orderbook for all selected instruments
                    const fetchPromises = selectedInstruments.map(inst =>
                        fetch('https://www.deribit.com/api/v2/public/get_order_book?instrument_name=' + inst)
                            .then(r => r.json())
                            .then(d => ({ instrument: inst, book: d.result }))
                            .catch(() => ({ instrument: inst, book: null }))
                    );

                    return Promise.all(fetchPromises).then(books => ({ books, selectedStrikes, allOptions }));
                })
                .then((result) => {
                    if (!result) return;
                    const { books, selectedStrikes, allOptions } = result;

                    let html = '';
                    const callCandidates = [];
                    const putCandidates = [];

                    selectedStrikes.forEach(strike => {
                        const callOpt = allOptions.find(o => o.strike === strike && o.option_type === 'call');
                        const putOpt = allOptions.find(o => o.strike === strike && o.option_type === 'put');

                        const callBook = callOpt ? books.find(b => b.instrument === callOpt.instrument_name)?.book : null;
                        const putBook = putOpt ? books.find(b => b.instrument === putOpt.instrument_name)?.book : null;

                        // Deribit prices are in BTC, convert to USD
                        const callPrice = callBook ? (callBook.ask_price || callBook.mark_price || 0) * btcPrice : 0;
                        const putPrice = putBook ? (putBook.ask_price || putBook.mark_price || 0) * btcPrice : 0;
                        // Deribit's order book response field is `mark_iv` (already in
                        // percent, e.g. 55.23 = 55.23%) — there is no plain `iv` field,
                        // which is why this was always reading undefined -> 0 before.
                        const callIVNum = callBook ? (callBook.mark_iv || 0) : 0;
                        const putIVNum = putBook ? (putBook.mark_iv || 0) : 0;
                        const callIV = callBook ? callIVNum.toFixed(1) : '-';
                        const putIV = putBook ? putIVNum.toFixed(1) : '-';
                        const callOINum = callBook ? (callBook.open_interest || 0) : 0;
                        const putOINum = putBook ? (putBook.open_interest || 0) : 0;
                        const callOI = callBook ? callOINum.toLocaleString() : '-';
                        const putOI = putBook ? putOINum.toLocaleString() : '-';
                        const callDeltaNum = callBook && callBook.greeks ? callBook.greeks.delta : null;
                        const putDeltaNum = putBook && putBook.greeks ? putBook.greeks.delta : null;
                        const callDelta = callDeltaNum !== null ? callDeltaNum.toFixed(3) : '-';
                        const putDelta = putDeltaNum !== null ? putDeltaNum.toFixed(3) : '-';
                        const callVolNum = callBook ? (callBook.stats?.volume || 0) : 0;
                        const putVolNum = putBook ? (putBook.stats?.volume || 0) : 0;
                        const callVolume = callBook ? callVolNum.toLocaleString() : '-';
                        const putVolume = putBook ? putVolNum.toLocaleString() : '-';

                        // Collect raw numeric data for the best-opportunity scan below
                        if (callBook && callPrice > 0 && callIVNum > 0 && callDeltaNum !== null) {
                            callCandidates.push({ strike, price: callPrice, iv: callIVNum, oi: callOINum, volume: callVolNum, delta: callDeltaNum });
                        }
                        if (putBook && putPrice > 0 && putIVNum > 0 && putDeltaNum !== null) {
                            putCandidates.push({ strike, price: putPrice, iv: putIVNum, oi: putOINum, volume: putVolNum, delta: putDeltaNum });
                        }

                        // Premium = Intrinsic Value + Time Value. Intrinsic is pure
                        // arithmetic from spot vs strike; whatever's left of the live
                        // premium is time value — deep ITM options (delta near ±1, like
                        // your 61000 example) have almost none left, ATM options have the most.
                        const callIntrinsic = Math.max(btcPrice - strike, 0);
                        const putIntrinsic = Math.max(strike - btcPrice, 0);

                        const strikePercent = ((strike - btcPrice) / btcPrice * 100).toFixed(1);
                        const isATM = Math.abs(parseFloat(strikePercent)) < 1;
                        const strikeLabel = '$' + strike.toLocaleString() + ' (' + (strikePercent > 0 ? '+' : '') + strikePercent + '%)';

                        html += '<tr>' +
                            '<td style="color: #ff6600; font-weight: 600;">' + (callPrice ? '$' + callPrice.toFixed(2) + premiumBreakdown(callPrice, callIntrinsic) : '-') + '</td>' +
                            '<td class="u74">' + callIV + '%</td>' +
                            '<td class="u74">' + callOI + '</td>' +
                            '<td class="u74">' + callVolume + '</td>' +
                            '<td class="u74">' + callDelta + '</td>' +
                            '<td style="text-align: center; font-weight: 700; font-family: monospace; font-size: 12px; background: ' + (isATM ? '#2563eb' : '#f7f8fa') + '; color: ' + (isATM ? '#f0f2f5' : '#111827') + ';">' + strikeLabel + '</td>' +
                            '<td class="u75">' + putDelta + '</td>' +
                            '<td class="u75">' + putVolume + '</td>' +
                            '<td class="u75">' + putOI + '</td>' +
                            '<td class="u75">' + putIV + '%</td>' +
                            '<td style="color: #6366f1; font-weight: 600;">' + (putPrice ? '$' + putPrice.toFixed(2) + premiumBreakdown(putPrice, putIntrinsic) : '-') + '</td>' +
                        '</tr>';
                    });

                    document.getElementById('btcOptionsChain').innerHTML = html || '<tr class="loading"><td class="u-c28" colspan="11">No options data</td></tr>';
                    computeBestOptionsOpportunity(callCandidates, putCandidates, btcPrice);
                })
                .catch(err => {
                    console.error('Options fetch error:', err);
                    document.getElementById('btcOptionsChain').innerHTML = '<tr class="loading"><td class="u-c28" colspan="11">Error loading live options data</td></tr>';
                });
        }

        function computeBestOptionsOpportunity(calls, puts, btcPrice) {
            function pickBest(list) {
                if (!list.length) return null;
                let pool = list.filter(o => Math.abs(o.delta) >= 0.15 && Math.abs(o.delta) <= 0.45);
                if (!pool.length) pool = list;

                const avgIV = pool.reduce((s, o) => s + o.iv, 0) / pool.length;
                const maxLiquidity = Math.max(1, ...pool.map(o => o.volume + o.oi));

                let best = null, bestScore = -Infinity;
                pool.forEach(o => {
                    const liquidityScore = (o.volume + o.oi) / maxLiquidity;             // 0..1, higher = more traded/held
                    const ivDiscount = avgIV > 0 ? (avgIV - o.iv) / avgIV : 0;            // >0 = cheaper vol than this chain's average
                    const score = liquidityScore * 0.55 + Math.max(-1, Math.min(1, ivDiscount)) * 0.45;
                    if (score > bestScore) { bestScore = score; best = Object.assign({ avgIV, ivDiscount }, o); }
                });
                return best;
            }

            const bestCall = pickBest(calls);
            const bestPut = pickBest(puts);

            function render(best, side, headId, detailId) {
                const headEl = document.getElementById(headId);
                const detailEl = document.getElementById(detailId);
                if (!headEl || !detailEl) return;
                if (!best) { headEl.textContent = '—'; detailEl.textContent = 'No liquid strikes with live IV/delta found for this expiry.'; return; }
                const breakeven = side === 'call' ? best.strike + best.price : best.strike - best.price;
                const breakevenPct = ((breakeven - btcPrice) / btcPrice * 100).toFixed(1);
                headEl.textContent = '$' + best.strike.toLocaleString() + ' ' + side.toUpperCase() + ' @ $' + best.price.toFixed(2);
                detailEl.innerHTML =
                    'IV ' + best.iv.toFixed(1) + '% (chain avg ' + best.avgIV.toFixed(1) + '%, ' +
                    Math.abs(best.ivDiscount * 100).toFixed(0) + '% ' + (best.ivDiscount >= 0 ? 'cheaper' : 'pricier') + ')<br>' +
                    'Delta ' + best.delta.toFixed(3) + ' &middot; Vol ' + best.volume.toLocaleString() + ' &middot; OI ' + best.oi.toLocaleString() + '<br>' +
                    'Breakeven ~$' + breakeven.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' (' + (breakevenPct > 0 ? '+' : '') + breakevenPct + '% from spot)';
            }

            render(bestCall, 'call', 'optBestCallHead', 'optBestCallDetail');
            render(bestPut, 'put', 'optBestPutHead', 'optBestPutDetail');
        }

        function updateGreeksHeatmap(btcPrice) {
            document.getElementById('btcCallDelta').textContent = (Math.random() * 0.5 + 0.3).toFixed(3);
            document.getElementById('btcPutDelta').textContent = (-(Math.random() * 0.5 + 0.3)).toFixed(3);
            document.getElementById('btcTotalGamma').textContent = (Math.random() * 0.01).toFixed(5);
            document.getElementById('btcTotalVega').textContent = (Math.random() * 50000).toLocaleString('en-US', {maximumFractionDigits: 0});
            document.getElementById('btcTotalTheta').textContent = (-(Math.random() * 10000)).toLocaleString('en-US', {maximumFractionDigits: 0});
            document.getElementById('btcGammaExp').textContent = (Math.random() * 0.1 + 0.05).toFixed(4);
        }

        function updateIVSkew(btcPrice) {
            if (chartInstances.ivSkew) chartInstances.ivSkew.destroy();
            const ctx = document.getElementById('btcIVSkewChart');
            if (ctx) {
                const strikes = Array.from({length: 15}, (_, i) => btcPrice * (0.90 + i * 0.0133));
                const ivs = strikes.map((s, i) => {
                    const distance = Math.abs(s - btcPrice) / btcPrice;
                    return 40 + distance * 50 + Math.random() * 5;
                });

                chartInstances.ivSkew = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: strikes.map(s => '$' + s.toLocaleString('en-US', {maximumFractionDigits: 0})),
                        datasets: [{
                            label: 'Implied Volatility',
                            data: ivs,
                            borderColor: '#d0d5de',
                            backgroundColor: 'rgba(29, 161, 242, 0.1)',
                            tension: 0.3,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } }
                    }
                });
            }
        }

        function updateOIChart(btcPrice) {
            if (chartInstances.oi) chartInstances.oi.destroy();
            const ctx = document.getElementById('btcOIChart');
            const strikes = Array.from({length: 15}, (_, i) => btcPrice * (0.90 + i * 0.0133));
            const callOI = strikes.map(() => Math.floor(Math.random() * 50000 + 10000));
            const putOI = strikes.map(() => Math.floor(Math.random() * 50000 + 10000));
            window.btcOIData = { strikes, callOI, putOI, btcPrice };
            if (ctx) {
                chartInstances.oi = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: strikes.map(s => '$' + s.toLocaleString('en-US', {maximumFractionDigits: 0})),
                        datasets: [{
                            label: 'Call OI',
                            data: callOI,
                            backgroundColor: 'rgba(255, 102, 0, 0.5)',
                            borderColor: '#ff6600'
                        }, {
                            label: 'Put OI',
                            data: putOI,
                            backgroundColor: 'rgba(0, 153, 204, 0.5)',
                            borderColor: '#6366f1'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: { x: { stacked: false } }
                    }
                });
            }
            updateOptionsLevelsAnalysis(btcPrice, strikes, callOI, putOI);
        }

        function updateOptionsLevelsAnalysis(btcPrice, strikes, callOI, putOI) {
            // Call Wall: strike with highest call OI (often acts as resistance / ceiling)
            const callWallIdx = callOI.indexOf(Math.max(...callOI));
            const callWallStrike = strikes[callWallIdx];
            // Put Wall: strike with highest put OI (often acts as support / floor)
            const putWallIdx = putOI.indexOf(Math.max(...putOI));
            const putWallStrike = strikes[putWallIdx];

            // Max Pain: strike where option writers' total payout is minimized
            let maxPainStrike = strikes[0], minPain = Infinity;
            strikes.forEach((k, i) => {
                let pain = 0;
                strikes.forEach((s2, j) => {
                    if (s2 < k) pain += putOI[j] * (k - s2); // ITM puts at expiry k
                    if (s2 > k) pain += callOI[j] * (s2 - k); // ITM calls at expiry k
                });
                if (pain < minPain) { minPain = pain; maxPainStrike = k; }
            });

            // Gamma flip: approximate as the strike nearest current price with balanced call/put OI (dealer neutral zone)
            let gammaFlipStrike = strikes.reduce((best, s, i) => {
                const balance = Math.abs(callOI[i] - putOI[i]);
                return balance < best.balance ? { strike: s, balance } : best;
            }, { strike: strikes[0], balance: Infinity }).strike;

            // Risk reversal proxy: relative OI skew between OTM calls vs OTM puts
            const otmCalls = strikes.reduce((sum, s, i) => s > btcPrice ? sum + callOI[i] : sum, 0);
            const otmPuts = strikes.reduce((sum, s, i) => s < btcPrice ? sum + putOI[i] : sum, 0);
            const riskReversal = ((otmCalls - otmPuts) / (otmCalls + otmPuts) * 100);

            window.btcOptionsLevels = { callWallStrike, putWallStrike, maxPainStrike, gammaFlipStrike, btcPrice };

            document.getElementById('optCallWall').textContent = '$' + callWallStrike.toLocaleString('en-US', {maximumFractionDigits: 0});
            document.getElementById('optPutWall').textContent = '$' + putWallStrike.toLocaleString('en-US', {maximumFractionDigits: 0});
            document.getElementById('optGammaFlip').textContent = '$' + gammaFlipStrike.toLocaleString('en-US', {maximumFractionDigits: 0});
            document.getElementById('optRiskReversal').innerHTML = `<span style="color:${riskReversal >= 0 ? '#059669' : '#dc2626'};">${riskReversal >= 0 ? '+' : ''}${riskReversal.toFixed(1)}%</span>`;
            document.getElementById('optBias').textContent = riskReversal > 5 ? 'Call-Skewed (Bullish)' : riskReversal < -5 ? 'Put-Skewed (Bearish)' : 'Neutral';
            document.getElementById('optPinRisk').textContent = Math.abs(btcPrice - maxPainStrike) / btcPrice < 0.02 ? 'High (near Max Pain)' : 'Low';

            const rows = [
                { label: 'Call Wall', price: callWallStrike, type: 'Resistance', note: 'Highest call OI — dealer short gamma above' },
                { label: 'Max Pain', price: maxPainStrike, type: 'Magnet', note: 'Price tends to gravitate here into expiry' },
                { label: 'Gamma Flip', price: gammaFlipStrike, type: 'Pivot', note: 'Dealer hedging flips direction around here' },
                { label: 'Put Wall', price: putWallStrike, type: 'Support', note: 'Highest put OI — dealer short gamma below' }
            ].sort((a, b) => b.price - a.price);

            document.getElementById('optLevelsTable').innerHTML = rows.map(r => `<tr>
                <td><strong>${r.label}</strong></td>
                <td>$${r.price.toLocaleString('en-US', {maximumFractionDigits: 0})}</td>
                <td style="color:${r.type === 'Resistance' ? '#dc2626' : r.type === 'Support' ? '#059669' : '#f59e0b'};">${r.type}</td>
                <td style="font-size:11px; color:#6b7280;">${r.note}</td>
            </tr>`).join('');
        }

        function updateVolumeProfile() {
            const btc = allCoins.find(c => c.id === 'bitcoin') || allCoins[0];
            const btcPrice = btc?.current_price || 43000;

            document.getElementById('pocPrice').textContent = `$${(btcPrice * (1 + (Math.random() - 0.5) * 0.02)).toLocaleString('en-US', {maximumFractionDigits: 0})}`;
            document.getElementById('vahPrice').textContent = `$${(btcPrice * 1.02).toLocaleString('en-US', {maximumFractionDigits: 0})}`;
            document.getElementById('valPrice').textContent = `$${(btcPrice * 0.98).toLocaleString('en-US', {maximumFractionDigits: 0})}`;
            document.getElementById('highestVol').textContent = `$${(btcPrice * (1 + (Math.random() - 0.5) * 0.03)).toLocaleString('en-US', {maximumFractionDigits: 0})}`;

            generateVolumeProfileChart(btcPrice);
            generateVolumeLevelTable(btcPrice);
        }

        function generateVolumeProfileChart(btcPrice) {
            if (chartInstances.volProfile) chartInstances.volProfile.destroy();
            const ctx = document.getElementById('volumeProfileChart');
            const levels = Array.from({length: 20}, (_, i) => btcPrice * (0.90 + i * 0.0105));
            const volumes = levels.map(() => Math.floor(Math.random() * 5000 + 1000));
            window.volProfileData = { levels, volumes, btcPrice };
            if (ctx) {
                chartInstances.volProfile = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: levels.map(l => '$' + l.toLocaleString('en-US', {maximumFractionDigits: 0})),
                        datasets: [{
                            label: 'Volume',
                            data: volumes,
                            backgroundColor: volumes.map(v => v > 3000 ? 'rgba(255, 0, 0, 0.6)' : 'rgba(29, 161, 242, 0.6)'),
                            borderColor: 'rgba(0, 0, 0, 0.1)'
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } }
                    }
                });
            }
            updateVolumeProfileAnalysis(btcPrice, levels, volumes);
        }

        function generateVolumeLevelTable(btcPrice) {
            let html = '';
            for (let i = 0; i < 10; i++) {
                const price = btcPrice * (1 + (Math.random() - 0.5) * 0.05);
                const volume = Math.floor(Math.random() * 10000 + 5000);
                const buyVol = Math.floor(volume * (Math.random() * 0.4 + 0.3));
                const sellVol = volume - buyVol;

                html += `<tr>
                    <td>$${price.toLocaleString('en-US', {maximumFractionDigits: 0})}</td>
                    <td>${volume.toLocaleString()}</td>
                    <td>${((volume / 50000) * 100).toFixed(2)}%</td>
                    <td style="color: #059669;">${buyVol.toLocaleString()}</td>
                    <td style="color: #dc2626;">${sellVol.toLocaleString()}</td>
                </tr>`;
            }

            document.getElementById('volumeLevelTable').innerHTML = html;
        }

        function updateVolumeProfileAnalysis(btcPrice, levels, volumes) {
            // Find POC (highest volume level) and value area (68% of volume around POC)
            const maxVol = Math.max(...volumes);
            const pocIdx = volumes.indexOf(maxVol);
            const pocPrice = levels[pocIdx];
            const totalVol = volumes.reduce((a, b) => a + b, 0);

            // Build value area by expanding outward from POC until ~68% of volume captured
            let vaVol = volumes[pocIdx];
            let lo = pocIdx, hi = pocIdx;
            while (vaVol / totalVol < 0.68 && (lo > 0 || hi < volumes.length - 1)) {
                const nextLo = lo > 0 ? volumes[lo - 1] : -1;
                const nextHi = hi < volumes.length - 1 ? volumes[hi + 1] : -1;
                if (nextHi >= nextLo) { hi++; vaVol += nextHi; } else { lo--; vaVol += nextLo; }
            }
            const vah = levels[hi], val = levels[lo];
            const vaWidthPct = ((vah - val) / btcPrice * 100);

            // Profile shape: P-shaped (heavy top, thin bottom -> uptrend acceptance), b-shaped (heavy bottom),
            // D-shaped (balanced, POC centered)
            const topHalfVol = volumes.slice(Math.floor(volumes.length / 2)).reduce((a, b) => a + b, 0);
            const botHalfVol = volumes.slice(0, Math.floor(volumes.length / 2)).reduce((a, b) => a + b, 0);
            const pocCentered = Math.abs(pocIdx - volumes.length / 2) < volumes.length * 0.15;
            let shape = 'D-Shape (Balanced)';
            if (!pocCentered && topHalfVol > botHalfVol * 1.3) shape = 'P-Shape (Top-Heavy, Accepted Higher)';
            else if (!pocCentered && botHalfVol > topHalfVol * 1.3) shape = 'b-Shape (Bottom-Heavy, Accepted Lower)';

            // HVN / LVN nodes: anything above 1.3x avg = HVN, below 0.7x avg = LVN
            const avgVol = totalVol / volumes.length;
            const hvnCount = volumes.filter(v => v > avgVol * 1.3).length;
            const lvnCount = volumes.filter(v => v < avgVol * 0.7).length;

            // Rotation factor: how much price oscillates through the value area (proxy via volume evenness)
            const variance = volumes.reduce((s, v) => s + Math.pow(v - avgVol, 2), 0) / volumes.length;
            const rotationFactor = Math.max(0, 100 - Math.sqrt(variance) / avgVol * 100).toFixed(0);

            const vsPoc = ((btcPrice - pocPrice) / pocPrice * 100);
            const balanceState = vaWidthPct < 3 ? 'Balanced (Rotational)' : 'Imbalanced (Trending)';

            document.getElementById('volShape').textContent = shape.split(' ')[0];
            document.getElementById('volVAWidth').textContent = vaWidthPct.toFixed(2) + '%';
            document.getElementById('volBalance').textContent = balanceState;
            document.getElementById('volRotation').textContent = rotationFactor + '%';
            document.getElementById('volVsPoc').innerHTML = `<span style="color:${vsPoc >= 0 ? '#059669' : '#dc2626'};">${vsPoc >= 0 ? '+' : ''}${vsPoc.toFixed(2)}%</span>`;
            document.getElementById('volNodeCount').textContent = `${hvnCount} HVN / ${lvnCount} LVN`;

            // Volume-based S/R table: POC, VAH, VAL, plus top HVN nodes
            window.volumeSRLevels = [];
            let rows = '';
            const addLevel = (label, price, type, node, strength) => {
                window.volumeSRLevels.push({ label, price, type, node, strength });
                rows += `<tr>
                    <td><strong>${label}</strong></td>
                    <td>$${price.toLocaleString('en-US', {maximumFractionDigits: 0})}</td>
                    <td style="color:${type === 'Resistance' ? '#dc2626' : type === 'Support' ? '#059669' : '#6b7280'};">${type}</td>
                    <td>${node}</td>
                    <td>${strength}</td>
                </tr>`;
            };
            addLevel('POC', pocPrice, pocPrice > btcPrice ? 'Resistance' : 'Support', 'HVN', 'Strong');
            addLevel('VAH', vah, 'Resistance', 'Boundary', 'Medium');
            addLevel('VAL', val, 'Support', 'Boundary', 'Medium');

            // Top 3 additional HVN nodes outside the value area
            const hvnIndices = volumes
                .map((v, i) => ({ v, i }))
                .filter(x => x.v > avgVol * 1.3 && (x.i < lo || x.i > hi))
                .sort((a, b) => b.v - a.v)
                .slice(0, 3);
            hvnIndices.forEach((x, idx) => {
                addLevel(`HVN ${idx + 1}`, levels[x.i], levels[x.i] > btcPrice ? 'Resistance' : 'Support', 'HVN', 'Medium');
            });

            document.getElementById('volSRTable').innerHTML = rows;
        }