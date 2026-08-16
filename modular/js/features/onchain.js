        function updateChainAnalysis() {
            // Exchange flows
            const inflow = (Math.random() * 5000 + 2000).toFixed(2);
            const outflow = (Math.random() * 5000 + 2000).toFixed(2);
            const netFlow = (parseFloat(outflow) - parseFloat(inflow)).toFixed(2);

            document.getElementById('chainExInflow').textContent = inflow + ' BTC';
            document.getElementById('chainExOutflow').textContent = outflow + ' BTC';
            document.getElementById('chainNetFlow').innerHTML = `<span style="color: ${netFlow > 0 ? '#059669' : '#dc2626'};">${netFlow > 0 ? '📤' : '📥'} ${Math.abs(netFlow)} BTC</span>`;

            // Large transfers
            const largeTx = Math.floor(Math.random() * 50 + 20);
            document.getElementById('chainLargeTx').textContent = largeTx + ' transfers';

            // Whale balance
            const whaleBalance = (Math.random() * 500000 + 200000).toFixed(0);
            document.getElementById('chainWhaleBalance').textContent = whaleBalance + ' BTC';

            // Exchange holding
            const exHolding = (Math.random() * 5 + 1).toFixed(1);
            document.getElementById('chainExHolding').textContent = exHolding + '%';

            // Network metrics
            document.getElementById('chainActiveAddr').textContent = (Math.random() * 500000 + 600000).toFixed(0);
            document.getElementById('chainTxCount').textContent = (Math.random() * 400000 + 250000).toFixed(0);
            document.getElementById('chainAvgFee').textContent = '$' + (Math.random() * 5 + 2).toFixed(2);
            document.getElementById('chainNetValue').textContent = '$' + formatNum(1200000000000);
            document.getElementById('chainMVRV').textContent = (Math.random() * 2 + 1.2).toFixed(2);
            document.getElementById('chainFearGreed').innerHTML = `<span style="color: ${Math.random() > 0.5 ? '#059669' : '#dc2626'};">${Math.random() > 0.5 ? 'Greed' : 'Fear'}</span>`;

            // Generate charts
            generateChainFlowChart();
            generateWhaleActivityChart();
            generateWhaleTransactions();
            updateAdvancedChainSignals();
        }

        function updateAdvancedChainSignals() {
            const sopr = (0.95 + Math.random() * 0.15); // >1 = profit-taking, <1 = capitulation
            const mvrvZ = (Math.random() * 6 - 1); // typical range -1 to 7
            const nupl = (Math.random() * 0.6 - 0.1); // net unrealized profit/loss ratio
            const puell = (0.5 + Math.random() * 2.5); // miner revenue vs 365d MA
            const dormancy = (Math.random() * 40 + 5); // avg age of coins moved, days

            const nuplZone = nupl > 0.5 ? 'Euphoria' : nupl > 0.25 ? 'Belief' : nupl > 0 ? 'Optimism' : nupl > -0.25 ? 'Hope/Fear' : 'Capitulation';

            document.getElementById('chainSOPR').innerHTML = `<span style="color:${sopr >= 1 ? '#059669' : '#dc2626'};">${sopr.toFixed(3)}</span>`;
            document.getElementById('chainMVRVZ').innerHTML = `<span style="color:${mvrvZ > 3.5 ? '#dc2626' : mvrvZ < 0 ? '#059669' : '#111827'};">${mvrvZ.toFixed(2)}</span>`;
            document.getElementById('chainNUPL').textContent = `${(nupl * 100).toFixed(1)}% (${nuplZone})`;
            document.getElementById('chainPuell').innerHTML = `<span style="color:${puell > 2 ? '#dc2626' : puell < 0.6 ? '#059669' : '#111827'};">${puell.toFixed(2)}</span>`;
            document.getElementById('chainDormancy').textContent = dormancy.toFixed(1) + ' days';

            // Composite health score (0-100): blends SOPR, MVRV-Z, NUPL, Puell into a rough regime read
            let score = 50;
            score += (sopr - 1) * 100;
            score -= mvrvZ * 5;
            score += nupl * 40;
            score -= (puell - 1) * 10;
            score = Math.max(0, Math.min(100, score));
            const scoreLabel = score > 70 ? 'Overheated' : score > 45 ? 'Healthy' : score > 25 ? 'Cooling' : 'Distressed';
            document.getElementById('chainHealthScore').innerHTML = `<span style="color:${score > 70 ? '#dc2626' : score < 25 ? '#dc2626' : '#059669'};">${score.toFixed(0)}/100 (${scoreLabel})</span>`;

            // HODL wave age bands (simulated distribution of supply by age)
            const bands = [
                { label: '< 1 month', base: 4 },
                { label: '1-3 months', base: 6 },
                { label: '3-6 months', base: 8 },
                { label: '6-12 months', base: 12 },
                { label: '1-2 years', base: 18 },
                { label: '2-5 years', base: 28 },
                { label: '5+ years', base: 24 }
            ];
            let rows = '';
            bands.forEach(b => {
                const pct = b.base + (Math.random() - 0.5) * 2;
                const change = (Math.random() - 0.5) * 3;
                const signal = change > 1 ? 'Coins aging (accumulation)' : change < -1 ? 'Coins moving (distribution)' : 'Stable';
                rows += `<tr>
                    <td>${b.label}</td>
                    <td>${pct.toFixed(1)}%</td>
                    <td style="color:${change >= 0 ? '#059669' : '#dc2626'};">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</td>
                    <td>${signal}</td>
                </tr>`;
            });
            document.getElementById('hodlWaveTable').innerHTML = rows;
        }

        function generateChainFlowChart() {
            if (chartInstances.chainFlow) chartInstances.chainFlow.destroy();

            // 7-day data
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const inflows = Array.from({length: 7}, () => Math.random() * 5000 + 2000);
            const outflows = Array.from({length: 7}, () => Math.random() * 5000 + 2000);

            const ctx = document.getElementById('chainFlowChart');
            if (ctx) {
                chartInstances.chainFlow = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: days,
                        datasets: [
                            {
                                label: 'Inflow',
                                data: inflows,
                                borderColor: '#dc2626',
                                backgroundColor: 'rgba(255, 0, 0, 0.1)',
                                tension: 0.3,
                                fill: false
                            },
                            {
                                label: 'Outflow',
                                data: outflows,
                                borderColor: '#059669',
                                backgroundColor: 'rgba(0, 255, 0, 0.1)',
                                tension: 0.3,
                                fill: false
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: { y: { grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { callback: (v) => v.toFixed(0) + ' BTC' } } }
                    }
                });
            }
        }

        function generateWhaleActivityChart() {
            if (chartInstances.whaleActivity) chartInstances.whaleActivity.destroy();

            // 10-minute window - whale trades ($1000+)
            const timeLabels = Array.from({length: 6}, (_, i) => (i * 2) + 'min');
            const whaleTradeValues = Array.from({length: 6}, () => Math.floor(Math.random() * 15 + 5));

            const ctx = document.getElementById('whaleActivityChart');
            if (ctx) {
                chartInstances.whaleActivity = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: timeLabels,
                        datasets: [{
                            label: 'Whale Trades ($1000+)',
                            data: whaleTradeValues,
                            backgroundColor: 'rgba(255, 215, 0, 0.7)',
                            borderColor: '#2563eb',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: {
                            y: {
                                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                                ticks: { callback: (v) => v + ' trades' }
                            }
                        }
                    }
                });
            }
        }

        function generateWhaleTransactions() {
            let html = '';

            for (let i = 0; i < 8; i++) {
                const time = new Date(Date.now() - i * 120000).toLocaleTimeString();
                const type = Math.random() > 0.5 ? 'Deposit' : 'Withdrawal';
                const amount = (Math.random() * 50 + 10).toFixed(4);
                const value = (amount * 43000).toFixed(0);
                const from = Math.random() > 0.5 ? 'Wallet' : 'Exchange';
                const to = from === 'Wallet' ? 'Exchange' : 'Wallet';
                const status = Math.random() > 0.1 ? 'Confirmed' : 'Pending';

                html += `<tr style="background: rgba(255, 215, 0, 0.1);">
                    <td>${time}</td>
                    <td style="color: ${type === 'Deposit' ? '#dc2626' : '#059669'}; font-weight: 600;">${type}</td>
                    <td>${amount}</td>
                    <td style="font-weight: 600;">$${value}</td>
                    <td>${from}</td>
                    <td>${to}</td>
                    <td style="color: ${status === 'Confirmed' ? '#059669' : '#2563eb'};">${status}</td>
                </tr>`;
            }

            document.getElementById('whaleTransactions').innerHTML = html;
        }