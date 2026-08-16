        const fundingSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PAXGUSDT', 'BNBUSDT', 'XRPUSDT'];
        let lastFundingRates = {};

        async function loadFundingRates() {
            const tbody = document.getElementById('fundingTable');
            tbody.innerHTML = '<tr class="loading"><td class="u-c24" colspan="5">Loading funding rates...</td></tr>';
            try {
                const results = await Promise.all(fundingSymbols.map(async sym => {
                    try {
                        const res = await fetchWithTimeout(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`, {}, 8000);
                        if (!res.ok) throw new Error('bad response');
                        return await res.json();
                    } catch (e) {
                        return null;
                    }
                }));

                let rows = '';
                let nextFundingTime = null;
                results.forEach((r, i) => {
                    if (!r) {
                        rows += `<tr><td>${fundingSymbols[i]}</td><td class="u76" colspan="4">Unavailable</td></tr>`;
                        return;
                    }
                    const rate = parseFloat(r.lastFundingRate) * 100;
                    const annualized = rate * 3 * 365; // 3 fundings/day * 365 days
                    lastFundingRates[r.symbol] = rate;
                    if (!nextFundingTime && r.nextFundingTime) nextFundingTime = r.nextFundingTime;
                    const bias = rate > 0 ? 'Longs pay Shorts' : rate < 0 ? 'Shorts pay Longs' : 'Neutral';
                    rows += `<tr>
                        <td><strong>${r.symbol}</strong></td>
                        <td style="color:${rate >= 0 ? '#dc2626' : '#059669'};">${rate.toFixed(4)}%</td>
                        <td style="color:${rate >= 0 ? '#dc2626' : '#059669'};">${annualized.toFixed(2)}%</td>
                        <td>${bias}</td>
                        <td>$${parseFloat(r.markPrice).toFixed(2)}</td>
                    </tr>`;
                });
                tbody.innerHTML = rows || '<tr><td class="u-c24" colspan="5">No data</td></tr>';

                if (nextFundingTime) {
                    updateFundingCountdown(nextFundingTime);
                }
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#dc2626;">Failed to load funding rates</td></tr>';
            }
        }

        function updateFundingCountdown(nextFundingTime) {
            if (window._fundingCountdownInterval) clearInterval(window._fundingCountdownInterval);
            const tick = () => {
                const diff = nextFundingTime - Date.now();
                if (diff <= 0) {
                    document.getElementById('fundNextVal').textContent = 'Now';
                    loadFundingRates();
                    return;
                }
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                document.getElementById('fundNextVal').textContent = `${h}h ${m}m ${s}s`;
            };
            tick();
            window._fundingCountdownInterval = setInterval(tick, 1000);
        }

        function calcFundingCost() {
            const notional = parseFloat(document.getElementById('fundNotional').value) || 5000;
            const days = parseFloat(document.getElementById('fundDays').value) || 7;
            const btcRate = (lastFundingRates['BTCUSDT'] || 0.01) / 100; // fraction, per 8h
            const fundingsPerDay = 3;
            const totalFundings = days * fundingsPerDay;
            const cost = notional * btcRate * totalFundings;

            document.getElementById('fundCostVal').innerHTML = `<span style="color:${cost <= 0 ? '#059669' : '#dc2626'};">${cost <= 0 ? '+' : '-'}$${Math.abs(cost).toFixed(2)}</span>`;

            // Cumulative funding cost chart across the holding period
            const dayLabels = Array.from({length: Math.ceil(days) + 1}, (_, i) => 'Day ' + i);
            const cumCost = dayLabels.map((_, i) => notional * btcRate * fundingsPerDay * i);

            if (chartInstances.fundCost) chartInstances.fundCost.destroy();
            const fundCtx = document.getElementById('fundCostChart');
            if (fundCtx) {
                chartInstances.fundCost = new Chart(fundCtx, {
                    type: 'bar',
                    data: {
                        labels: dayLabels,
                        datasets: [{
                            label: 'Cumulative Funding Cost $',
                            data: cumCost,
                            backgroundColor: cumCost.map(c => c <= 0 ? 'rgba(0,255,0,0.4)' : 'rgba(255,0,0,0.4)'),
                            borderColor: cumCost.map(c => c <= 0 ? '#059669' : '#dc2626'),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v) => '$' + v.toFixed(0) } } }
                    }
                });
            }
        }