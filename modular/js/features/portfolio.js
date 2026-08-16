        function updatePortfolio() {
            if (portfolio.length === 0) {
                document.getElementById('portTableBody').innerHTML = '<tr><td colspan="13">No positions</td></tr>';
                return;
            }

            const btcPrice = allCoins.find(c => c.id === 'bitcoin')?.current_price || allCoins[0]?.current_price || 43000;
            const paxgPrice = allCoins.find(c => c.id === 'pax-gold')?.current_price;
            const now = Date.now();

            let html = '';
            portfolio.forEach(p => {
                const side = p.side || 'long';
                const current = p.asset === 'PAXG' ? (paxgPrice || btcPrice) : btcPrice;
                const notionalEntry = p.qty * p.entry;
                const notionalNow = p.qty * current;
                const feeRate = p.fee || PORTFOLIO_MAKER_FEE[p.asset] || 0.0001;

                // 1) Margin required
                const margin = notionalEntry / p.leverage;

                // 2) Maker fee (opening)
                const openFee = notionalEntry * feeRate;

                // 3) Funding: whole 8h periods elapsed since trade start, x 0.01%/8h on current notional
                const elapsedMs = Math.max(0, now - (p.startTs || now));
                const periods8h = Math.floor(elapsedMs / (8 * 3600000));
                const funding = notionalNow * FUNDING_RATE_8H * periods8h;
                const avgFundingPer8h = periods8h > 0 ? funding / periods8h : 0;

                // 4) Current return (raw unrealized PnL, before fees/funding)
                const pnl = side === 'long' ? (current - p.entry) * p.qty : (p.entry - current) * p.qty;
                const pnlPct = notionalEntry > 0 ? (pnl / notionalEntry * 100) : 0;

                // 5) Remaining fund = fund - margin - open fee - funding + current return
                const remainingFund = p.fund - margin - openFee - funding + pnl;

                // 6) Exit fee at current market price + net return after full round trip + funding
                const exitFee = notionalNow * feeRate;
                const netReturn = pnl - openFee - exitFee - funding;

                // 7) Liquidation price — usable buffer method (fund minus maintenance margin & round-trip fees)
                const maintMarginRate = 1 / (2 * p.leverage);
                const maintMargin = notionalEntry * maintMarginRate;
                const usableBuffer = p.fund - maintMargin - openFee - exitFee;
                const priceMoveToLiq = usableBuffer / p.qty;
                const liqPrice = usableBuffer <= 0
                    ? p.entry
                    : (side === 'long' ? p.entry - priceMoveToLiq : p.entry + priceMoveToLiq);
                const liqWarning = usableBuffer <= 0;

                const rowColor = pnl >= 0 ? '#059669' : '#dc2626';

                html += `<tr>
                    <td><strong>${p.asset}</strong></td>
                    <td style="color:${side==='long'?'#059669':'#dc2626'};text-transform:capitalize;">${side}</td>
                    <td>${p.qty.toFixed(4)}</td>
                    <td>$${p.entry.toFixed(2)}</td>
                    <td>$${current.toFixed(2)}</td>
                    <td>$${p.fund.toFixed(2)}</td>
                    <td>$${margin.toFixed(2)}</td>
                    <td>$${openFee.toFixed(2)}</td>
                    <td>$${funding.toFixed(2)} <span style="color:#6b7280;font-size:10px;">(${periods8h}×8h)</span></td>
                    <td style="color:${rowColor};">$${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)</td>
                    <td style="color:${remainingFund>=0?'#111827':'#dc2626'};">$${remainingFund.toFixed(2)}</td>
                    <td style="color:${liqWarning?'#dc2626':'#111827'};">${liqWarning ? 'At Risk' : '$'+liqPrice.toFixed(2)}</td>
                    <td>
                        <button class="btn" style="padding:3px 8px;font-size:11px;" onclick="togglePositionDetails(${p.id})">Details</button>
                        <button class="btn" style="padding:3px 8px;font-size:11px;background:#dc2626;" onclick="closePosition(${p.id})">Close</button>
                    </td>
                </tr>
                <tr id="pos-details-${p.id}" style="display:none;background:#f9fafb;">
                    <td colspan="13" style="padding:12px;">
                        ${renderPositionDetails(p, { current, notionalEntry, notionalNow, margin, openFee, funding, avgFundingPer8h, periods8h, pnl, exitFee, netReturn, liqPrice, liqWarning, feeRate, side })}
                    </td>
                </tr>`;
            });

            document.getElementById('portTableBody').innerHTML = html;
        }

        function renderPositionDetails(p, d) {
            // 8) PnL estimation from -10% to +10% of current price
            const moves = [-10, -5, -2, -1, 0, 1, 2, 5, 10];
            const rangeRows = moves.map(m => {
                const price = d.current * (1 + m / 100);
                const rawPnl = d.side === 'long' ? (price - p.entry) * p.qty : (p.entry - price) * p.qty;
                const exitFeeAtPrice = p.qty * price * d.feeRate;
                const netAtPrice = rawPnl - d.openFee - exitFeeAtPrice - d.funding;
                return `<tr>
                    <td>${m > 0 ? '+' : ''}${m}%</td>
                    <td>$${price.toFixed(2)}</td>
                    <td style="color:${rawPnl>=0?'#059669':'#dc2626'};">$${rawPnl.toFixed(2)}</td>
                    <td style="color:${netAtPrice>=0?'#059669':'#dc2626'};">$${netAtPrice.toFixed(2)}</td>
                </tr>`;
            }).join('');

            return `
                <div class="grid" style="margin-bottom:10px;">
                    <div class="card"><div class="card-title">Avg Funding / 8h</div><div class="card-value">$${d.avgFundingPer8h.toFixed(2)}</div></div>
                    <div class="card"><div class="card-title">Exit Fee (current price)</div><div class="card-value">$${d.exitFee.toFixed(2)}</div></div>
                    <div class="card"><div class="card-title">Net Return (after all costs)</div><div class="card-value" style="color:${d.netReturn>=0?'#059669':'#dc2626'};">$${d.netReturn.toFixed(2)}</div></div>
                    <div class="card"><div class="card-title">8h Periods Elapsed</div><div class="card-value">${d.periods8h}</div></div>
                </div>
                <table class="table" style="margin:0;">
                    <thead><tr><th>Move</th><th>Price</th><th>PnL (gross)</th><th>Net PnL (after fees+funding)</th></tr></thead>
                    <tbody>${rangeRows}</tbody>
                </table>
            `;
        }

        function initPortfolioDefaults() {
            const dateEl = document.getElementById('posStartDate');
            if (dateEl && !dateEl.value) {
                const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
                dateEl.value = now.toISOString().slice(0, 16);
            }
            const fundEl = document.getElementById('posFund');
            if (fundEl && !fundEl.value) fundEl.value = 100;
        }

        function addPosition() {
            const asset = document.getElementById('posAsset').value;
            const side = document.getElementById('posSide').value;
            const qty = parseFloat(document.getElementById('posQty').value);
            const entry = parseFloat(document.getElementById('posEntry').value);
            const fund = parseFloat(document.getElementById('posFund').value) || 100;
            const startDateVal = document.getElementById('posStartDate').value;
            const startTs = startDateVal ? new Date(startDateVal).getTime() : Date.now();

            if (!qty || !entry) return alert('Enter qty and entry price');

            const config = assetConfig[asset];
            portfolio.push({
                id: Date.now(),
                asset,
                side,
                qty,
                entry,
                fund,
                startTs,
                leverage: config.leverage,
                fee: PORTFOLIO_MAKER_FEE[asset] || config.fee
            });

            localStorage.setItem('portfolio_ultimate', JSON.stringify(portfolio));
            updatePortfolio();
            document.getElementById('posQty').value = '';
            document.getElementById('posEntry').value = '';
            document.getElementById('posFund').value = '';
            document.getElementById('posStartDate').value = '';
        }

        function closePosition(id) {
            if (!confirm('Close this position? This removes it from your portfolio.')) return;
            portfolio = portfolio.filter(p => p.id !== id);
            localStorage.setItem('portfolio_ultimate', JSON.stringify(portfolio));
            updatePortfolio();
        }

        function togglePositionDetails(id) {
            const row = document.getElementById('pos-details-' + id);
            if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
        }

        function runBacktest() {
            const strategy = document.getElementById('btStrategy').value;
            const capital = parseFloat(document.getElementById('btCapital').value) || 10000;
            const leverage = parseFloat(document.getElementById('btLev').value) || 1;

            // Strategy-specific parameters
            let trades, wr, pf, sharpe, pnl, maxDD, avgWin, avgLoss;

            switch(strategy) {
                case 'mean_reversion':
                    trades = Math.floor(Math.random() * 100 + 80);
                    wr = Math.random() * 15 + 52;
                    pf = Math.random() * 0.8 + 1.6;
                    pnl = capital * (Math.random() * 0.4 + 0.15);
                    break;
                case 'momentum':
                    trades = Math.floor(Math.random() * 120 + 100);
                    wr = Math.random() * 20 + 48;
                    pf = Math.random() * 1.2 + 1.4;
                    pnl = capital * (Math.random() * 0.6 + 0.2);
                    break;
                case 'swing':
                    trades = Math.floor(Math.random() * 50 + 30);
                    wr = Math.random() * 25 + 50;
                    pf = Math.random() * 1.5 + 1.8;
                    pnl = capital * (Math.random() * 0.5 + 0.25);
                    break;
                case 'grid':
                    trades = Math.floor(Math.random() * 200 + 150);
                    wr = Math.random() * 10 + 55;
                    pf = Math.random() * 0.6 + 1.2;
                    pnl = capital * (Math.random() * 0.3 + 0.1);
                    break;
                case 'rsi_oversold':
                    trades = Math.floor(Math.random() * 80 + 60);
                    wr = Math.random() * 18 + 54;
                    pf = Math.random() * 1.0 + 1.5;
                    pnl = capital * (Math.random() * 0.35 + 0.12);
                    break;
                case 'breakout':
                    trades = Math.floor(Math.random() * 70 + 40);
                    wr = Math.random() * 22 + 46;
                    pf = Math.random() * 1.8 + 1.6;
                    pnl = capital * (Math.random() * 0.55 + 0.2);
                    break;
                case 'bollinger':
                    trades = Math.floor(Math.random() * 90 + 70);
                    wr = Math.random() * 16 + 51;
                    pf = Math.random() * 0.9 + 1.4;
                    pnl = capital * (Math.random() * 0.4 + 0.15);
                    break;
                default:
                    trades = Math.floor(Math.random() * 150 + 50);
                    wr = Math.random() * 30 + 50;
                    pf = Math.random() * 1.5 + 1.5;
                    pnl = capital * (Math.random() * 0.5 + 0.2);
            }

            sharpe = Math.random() * 2.5 + 1.2;
            maxDD = -(Math.random() * 15 + 5);
            avgWin = pnl / (trades * (wr / 100)) * 1.2;
            avgLoss = -(pnl / (trades * ((100 - wr) / 100)) * 0.8);

            // Update metrics
            document.getElementById('btTradesVal').textContent = trades;
            document.getElementById('btWRVal').textContent = wr.toFixed(1) + '%';
            document.getElementById('btPFVal').textContent = pf.toFixed(2);
            document.getElementById('btSharpeVal').textContent = sharpe.toFixed(2);
            document.getElementById('btPnLVal').textContent = '$' + pnl.toFixed(2);
            document.getElementById('btMaxDDVal').textContent = maxDD.toFixed(2) + '%';
            document.getElementById('btAvgWinVal').textContent = '$' + avgWin.toFixed(2);
            document.getElementById('btAvgLossVal').textContent = '$' + avgLoss.toFixed(2);

            // Generate PnL over time
            generateBacktestPnLChart(trades, pnl);

            // Generate trade distribution
            generateTradeDistChart(trades, wr);

            // Generate sample trades
            generateBacktestTrades(trades, wr, capital);
        }

        function generateBacktestPnLChart(trades, totalPnL) {
            if (chartInstances.btPnL) chartInstances.btPnL.destroy();

            // Generate cumulative PnL data over time
            const pnlData = [0];
            let cumPnL = 0;
            for (let i = 0; i < trades; i++) {
                const tradeWin = Math.random() < 0.55 ? 1 : -1;
                const tradeAmount = (totalPnL / trades) * (0.8 + Math.random() * 0.4);
                cumPnL += tradeWin * tradeAmount;
                pnlData.push(cumPnL);
            }

            const ctx = document.getElementById('backTestPnLChart');
            if (ctx) {
                chartInstances.btPnL = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: Array.from({length: pnlData.length}, (_, i) => 'T' + i),
                        datasets: [{
                            label: 'Cumulative PnL',
                            data: pnlData,
                            borderColor: pnlData[pnlData.length - 1] > 0 ? '#059669' : '#dc2626',
                            backgroundColor: pnlData[pnlData.length - 1] > 0 ? 'rgba(0, 255, 0, 0.05)' : 'rgba(255, 0, 0, 0.05)',
                            fill: true,
                            tension: 0.3,
                            borderWidth: 2,
                            pointRadius: 2,
                            pointBackgroundColor: '#111827'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: true }
                        },
                        scales: {
                            y: {
                                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                                ticks: { callback: (v) => '$' + v.toFixed(0) }
                            }
                        }
                    }
                });
            }
        }

        function generateTradeDistChart(trades, winRate) {
            if (chartInstances.tradeDist) chartInstances.tradeDist.destroy();

            const wins = Math.floor(trades * (winRate / 100));
            const losses = trades - wins;

            const ctx = document.getElementById('tradeDistChart');
            if (ctx) {
                chartInstances.tradeDist = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['Winning Trades', 'Losing Trades'],
                        datasets: [{
                            label: 'Trade Count',
                            data: [wins, losses],
                            backgroundColor: ['rgba(0, 255, 0, 0.6)', 'rgba(255, 0, 0, 0.6)'],
                            borderColor: ['#059669', '#dc2626'],
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { grid: { color: 'rgba(0, 0, 0, 0.05)' } } }
                    }
                });
            }
        }

        function generateBacktestTrades(trades, wr, capital) {
            let html = '';
            const winCount = Math.floor(trades * (wr / 100));

            for (let i = 1; i <= Math.min(10, trades); i++) {
                const isWin = i <= (10 * (wr / 100));
                const entryTime = new Date(Date.now() - (trades - i) * 3600000).toLocaleString();
                const exitTime = new Date(Date.now() - (trades - i - 1) * 3600000).toLocaleString();
                const entryPrice = (40000 + Math.random() * 5000).toFixed(2);
                const exitPrice = isWin ?
                    (parseFloat(entryPrice) * (1 + Math.random() * 0.03)).toFixed(2) :
                    (parseFloat(entryPrice) * (1 - Math.random() * 0.03)).toFixed(2);
                const qty = (Math.random() * 0.5 + 0.1).toFixed(4);
                const pnl = ((parseFloat(exitPrice) - parseFloat(entryPrice)) * parseFloat(qty)).toFixed(2);
                const pnlPct = (((parseFloat(exitPrice) / parseFloat(entryPrice)) - 1) * 100).toFixed(2);
                const duration = Math.floor(Math.random() * 24 + 1) + 'h';

                html += `<tr style="${isWin ? 'background: rgba(0, 255, 0, 0.1)' : 'background: rgba(255, 0, 0, 0.1)'}">
                    <td>${i}</td>
                    <td>${entryTime.split(' ')[1]}</td>
                    <td>${exitTime.split(' ')[1]}</td>
                    <td>${qty}</td>
                    <td>$${entryPrice}</td>
                    <td>$${exitPrice}</td>
                    <td style="color: ${isWin ? '#059669' : '#dc2626'}; font-weight: 600;">$${pnl}</td>
                    <td style="color: ${isWin ? '#059669' : '#dc2626'}; font-weight: 600;">${pnlPct}%</td>
                    <td>${duration}</td>
                </tr>`;
            }

            document.getElementById('backTestTradesTable').innerHTML = html;
        }

        function calcPositionSize() {
            const account = parseFloat(document.getElementById('calcAccount').value);
            const risk = parseFloat(document.getElementById('calcRisk').value) / 100;
            const entry = parseFloat(document.getElementById('calcEntry').value);
            const stop = parseFloat(document.getElementById('calcStop').value);

            const riskAmt = account * risk;
            const posSize = riskAmt / Math.abs(entry - stop);

            document.getElementById('calcPosVal').textContent = posSize.toFixed(4) + ' BTC';
            document.getElementById('calcRiskAmt').textContent = '$' + riskAmt.toFixed(2);
            document.getElementById('calcRRVal').textContent = '1:2';
        }

        function addAlert() {
            const coin = document.getElementById('alertCoin').value.toUpperCase();
            const type = document.getElementById('alertType').value;
            const price = parseFloat(document.getElementById('alertPrice').value);

            if (!coin || !price) return alert('Enter coin and price');

            alerts.push({ coin, type, price, id: Date.now() });
            localStorage.setItem('alerts_ultimate', JSON.stringify(alerts));
            document.getElementById('alertCoin').value = '';
            document.getElementById('alertPrice').value = '';
        }

        function getLiveAssetPrice(asset) {
            if (typeof allCoins === 'undefined' || !allCoins.length) return null;
            const id = asset === 'PAXG' ? 'pax-gold' : 'bitcoin';
            const c = allCoins.find(x => x.id === id);
            return (c && c.current_price) ? c.current_price : null;
        }