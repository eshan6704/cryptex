        function liqAssetChanged() {
            const asset = document.getElementById('liqAsset').value;
            const cfg = assetConfig[asset];
            document.getElementById('liqLeverage').value = cfg.leverage;
            const price = getLiveAssetPrice(asset);
            if (price) document.getElementById('liqEntry').value = price.toFixed(2);
        }

        function initLiqCalcDefaults() {
            const asset = document.getElementById('liqAsset')?.value || 'BTC';
            const entryEl = document.getElementById('liqEntry');
            const balEl = document.getElementById('liqBalance');
            if (entryEl) {
                const price = getLiveAssetPrice(asset);
                if (price) entryEl.value = price.toFixed(2);
            }
            if (balEl && !balEl.value) balEl.value = 100;
        }

        const LOT_SIZE = 0.001; // 1 lot = 0.001 BTC or 0.001 PAXG

        function calcLiquidation() {
            const asset = document.getElementById('liqAsset').value;
            const side = document.getElementById('liqSide').value;
            const entry = parseFloat(document.getElementById('liqEntry').value);
            const leverage = parseFloat(document.getElementById('liqLeverage').value) || assetConfig[asset].leverage;
            const lots = parseFloat(document.getElementById('liqLots').value);
            const balance = parseFloat(document.getElementById('liqBalance').value);

            if (!entry || !lots || !balance) { alert('Enter entry price, lots, and available balance'); return; }

            // Qty is derived from lots, NOT from balance/leverage
            const qty = lots * LOT_SIZE;
            const notional = qty * entry;
            const marginRequired = notional / leverage;
            const feeRate = assetConfig[asset].fee; // per-side brokerage fee, fraction
            const maintenanceMarginRate = 1 / (2 * leverage); // maintenance margin ~ half of initial margin rate

            // Reserve maintenance margin + est. round-trip brokerage fees out of available balance
            const maintenanceMargin = notional * maintenanceMarginRate;
            const openFee = notional * feeRate;
            const closeFeeEst = notional * feeRate; // estimated at ~entry notional
            const totalFees = openFee + closeFeeEst;
            const usableBuffer = balance - maintenanceMargin - totalFees;

            // Loss-per-$1000-move method: distance = usable buffer / qty
            const lossPer1000Move = qty * 1000; // $ PnL change per $1000 move in underlying
            const priceMoveToLiq = usableBuffer / qty;

            let liqPrice;
            if (side === 'long') {
                liqPrice = entry - priceMoveToLiq;
            } else {
                liqPrice = entry + priceMoveToLiq;
            }

            const distPct = Math.abs((liqPrice - entry) / entry * 100);
            const insufficientMargin = usableBuffer <= 0;

            document.getElementById('liqPriceVal').innerHTML = insufficientMargin
                ? '<span class="u76">Already liquidatable</span>'
                : '$' + liqPrice.toFixed(2);
            document.getElementById('liqDistVal').textContent = insufficientMargin ? '0%' : distPct.toFixed(2) + '%';
            document.getElementById('liqQtyVal').textContent = qty.toFixed(6) + (asset === 'BTC' ? ' BTC' : ' oz') + ` (${lots} lots)`;
            document.getElementById('liqNotionalVal').textContent = '$' + notional.toFixed(2);
            document.getElementById('liqMarginVal').textContent = '$' + marginRequired.toFixed(2) + ` (maint. $${maintenanceMargin.toFixed(2)}, fees $${totalFees.toFixed(2)})`;
            document.getElementById('liqPerMoveVal').textContent = '$' + lossPer1000Move.toFixed(2);

            // Detailed risk analysis
            const effLeverage = notional / balance;
            const marginRatioPct = (balance / notional * 100);
            const pnlUp5 = (side === 'long' ? (entry * 1.05 - entry) : (entry - entry * 1.05)) * qty;
            const pnlDown5 = (side === 'long' ? (entry * 0.95 - entry) : (entry - entry * 0.95)) * qty;
            const roeUp5 = (pnlUp5 / balance * 100);
            const roeDown5 = (pnlDown5 / balance * 100);

            document.getElementById('liqEffLev').textContent = effLeverage.toFixed(1) + 'x';
            document.getElementById('liqMarginRatio').textContent = marginRatioPct.toFixed(2) + '%';
            document.getElementById('liqMaxLoss').textContent = '$' + balance.toFixed(2);
            document.getElementById('liqFeesVal').textContent = '$' + totalFees.toFixed(2);
            document.getElementById('liqROEUp').innerHTML = `<span style="color:#059669;">+${roeUp5.toFixed(1)}%</span>`;
            document.getElementById('liqROEDown').innerHTML = `<span class="u76">${roeDown5.toFixed(1)}%</span>`;

            if (insufficientMargin) {
                document.getElementById('liqBufferTable').innerHTML = '<tr><td class="u76" colspan="4">Available balance does not cover maintenance margin + fees for this size. Reduce lots or add margin.</td></tr>';
                if (chartInstances.liqPnl) { chartInstances.liqPnl.destroy(); chartInstances.liqPnl = null; }
                return;
            }

            // PnL vs Price chart, liquidation price marked
            let low, high;
            if (side === 'long') {
                low = liqPrice * 0.98;
                high = entry + Math.abs(entry - liqPrice) * 1.5;
            } else {
                high = liqPrice * 1.02;
                low = entry - Math.abs(liqPrice - entry) * 1.5;
            }
            const steps = 24;
            const pricePoints = Array.from({length: steps + 1}, (_, i) => low + (high - low) * i / steps);
            // Snap the point nearest to liqPrice exactly onto liqPrice so it's clearly marked
            let liqIdx = 0, liqDiff = Infinity;
            pricePoints.forEach((p, i) => { const d = Math.abs(p - liqPrice); if (d < liqDiff) { liqDiff = d; liqIdx = i; } });
            pricePoints[liqIdx] = liqPrice;

            const pnlPoints = pricePoints.map(p => side === 'long' ? (p - entry) * qty : (entry - p) * qty);
            const marginPctPoints = pnlPoints.map(pnl2 => ((usableBuffer + pnl2) / usableBuffer * 100));
            const pointColors = pricePoints.map((p, i) => i === liqIdx ? '#dc2626' : (pnlPoints[i] >= 0 ? '#059669' : '#ff6b6b'));
            const pointRadii = pricePoints.map((p, i) => i === liqIdx ? 7 : 2);

            if (chartInstances.liqPnl) chartInstances.liqPnl.destroy();
            const liqCtx = document.getElementById('liqPnlChart');
            if (liqCtx) {
                chartInstances.liqPnl = new Chart(liqCtx, {
                    type: 'line',
                    data: {
                        labels: pricePoints.map(p => '$' + p.toFixed(0)),
                        datasets: [
                            {
                                label: 'PnL $',
                                data: pnlPoints,
                                borderColor: '#111827',
                                backgroundColor: 'rgba(0,0,0,0.03)',
                                fill: true,
                                tension: 0.15,
                                pointBackgroundColor: pointColors,
                                pointRadius: pointRadii,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Margin Remaining %',
                                data: marginPctPoints,
                                borderColor: '#f59e0b',
                                borderDash: [4, 3],
                                fill: false,
                                tension: 0.15,
                                pointRadius: 0,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: {
                            y: { position: 'left', grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v) => '$' + v.toFixed(0) } },
                            y1: { position: 'right', grid: { display: false }, ticks: { callback: (v) => v.toFixed(0) + '%' } }
                        }
                    }
                });
            }

            // Survival buffer table across a range of moves — based on usable buffer after margin+fee reservation
            const moves = side === 'long'
                ? [-0.01, -0.02, -0.05, -0.10, -0.25, -0.5]
                : [0.01, 0.02, 0.05, 0.10, 0.25, 0.5];
            let rows = '';
            moves.forEach(m => {
                const newPrice = entry * (1 + m);
                const pnl = side === 'long' ? (newPrice - entry) * qty : (entry - newPrice) * qty;
                const marginRemaining = ((usableBuffer + pnl) / usableBuffer * 100);
                const danger = marginRemaining <= 15;
                rows += `<tr style="${danger ? 'background: rgba(255,0,0,0.08);' : ''}">
                    <td>${(m * 100).toFixed(0)}%</td>
                    <td>$${newPrice.toFixed(2)}</td>
                    <td style="color:${pnl >= 0 ? '#059669' : '#dc2626'};">$${pnl.toFixed(2)}</td>
                    <td style="color:${danger ? '#dc2626' : '#111827'}; font-weight:${danger ? '700' : '400'};">${marginRemaining.toFixed(1)}%</td>
                </tr>`;
            });
            document.getElementById('liqBufferTable').innerHTML = rows;
        }

        function initDCADefaults() {
            const startEl = document.getElementById('dcaStartPrice');
            if (startEl) {
                const price = getLiveAssetPrice('BTC'); // DCA planner defaults to BTC pricing
                if (price) startEl.value = price.toFixed(2);
            }
        }

        function runDCAPlan() {
            const total = parseFloat(document.getElementById('dcaTotal').value) || 10000;
            const count = parseInt(document.getElementById('dcaCount').value) || 10;
            const startPrice = parseFloat(document.getElementById('dcaStartPrice').value) || 43000;
            const trend = document.getElementById('dcaTrend').value;
            const vol = (parseFloat(document.getElementById('dcaVol').value) || 8) / 100;

            const perBuy = total / count;
            let price = startPrice;
            let totalQty = 0;
            let totalSpent = 0;
            const priceSeries = [price];
            const avgCostSeries = [];
            const investedSeries = [];
            const valueSeries = [];
            let rows = '';

            for (let i = 1; i <= count; i++) {
                // Deterministic-ish walk seeded by trend + pseudo-random noise
                const drift = trend === 'down' ? -0.012 : trend === 'up' ? 0.012 : 0;
                const noise = (Math.sin(i * 12.9898) * 43758.5453 % 1) * vol * 2 - vol;
                price = Math.max(1, price * (1 + drift + noise));
                const qtyBought = perBuy / price;
                totalQty += qtyBought;
                totalSpent += perBuy;
                const runningAvg = totalSpent / totalQty;
                priceSeries.push(price);
                avgCostSeries.push(runningAvg);
                investedSeries.push(totalSpent);
                valueSeries.push(totalQty * price); // mark-to-market at that step's price

                rows += `<tr>
                    <td>${i}</td>
                    <td>$${price.toFixed(2)}</td>
                    <td>$${perBuy.toFixed(2)}</td>
                    <td>${qtyBought.toFixed(6)}</td>
                    <td>$${runningAvg.toFixed(2)}</td>
                </tr>`;
            }

            const avgPrice = totalSpent / totalQty;
            const lumpQty = total / startPrice;
            const lumpValueNow = lumpQty * price;
            const dcaValueNow = totalQty * price;
            const vsLump = ((dcaValueNow - lumpValueNow) / lumpValueNow * 100);

            document.getElementById('dcaAvgPrice').textContent = '$' + avgPrice.toFixed(2);
            document.getElementById('dcaTotalQty').textContent = totalQty.toFixed(6) + ` (${(totalQty / LOT_SIZE).toFixed(1)} lots)`;
            document.getElementById('dcaPerBuy').textContent = '$' + perBuy.toFixed(2);
            document.getElementById('dcaVsLump').innerHTML = `<span style="color:${vsLump >= 0 ? '#059669' : '#dc2626'};">${vsLump >= 0 ? '+' : ''}${vsLump.toFixed(2)}%</span>`;
            document.getElementById('dcaScheduleTable').innerHTML = rows;

            if (chartInstances.dca) chartInstances.dca.destroy();
            const ctx = document.getElementById('dcaChart');
            if (ctx) {
                chartInstances.dca = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: Array.from({length: count}, (_, i) => 'Buy ' + (i + 1)),
                        datasets: [
                            {
                                label: 'Market Price',
                                data: priceSeries.slice(1),
                                borderColor: '#6b7280',
                                borderDash: [4, 3],
                                fill: false,
                                tension: 0.2,
                                pointRadius: 2
                            },
                            {
                                label: 'Running Avg Cost',
                                data: avgCostSeries,
                                borderColor: '#059669',
                                backgroundColor: 'rgba(0,255,0,0.05)',
                                fill: true,
                                tension: 0.2,
                                pointRadius: 2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: { y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v) => '$' + v.toFixed(0) } } }
                    }
                });
            }

            if (chartInstances.dcaPnl) chartInstances.dcaPnl.destroy();
            const pnlCtx = document.getElementById('dcaPnlChart');
            if (pnlCtx) {
                const pnlColors = valueSeries.map((v, i) => v >= investedSeries[i] ? '#059669' : '#dc2626');
                chartInstances.dcaPnl = new Chart(pnlCtx, {
                    type: 'line',
                    data: {
                        labels: Array.from({length: count}, (_, i) => 'Buy ' + (i + 1)),
                        datasets: [
                            {
                                label: 'Total Invested',
                                data: investedSeries,
                                borderColor: '#6b7280',
                                borderDash: [4, 3],
                                fill: false,
                                tension: 0.1,
                                pointRadius: 0
                            },
                            {
                                label: 'Portfolio Value',
                                data: valueSeries,
                                borderColor: '#111827',
                                backgroundColor: 'rgba(0,0,0,0.03)',
                                fill: true,
                                tension: 0.2,
                                pointBackgroundColor: pnlColors,
                                pointRadius: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: { y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v) => '$' + v.toFixed(0) } } }
                    }
                });
            }
        }

        function feeAssetChanged() {
            const asset = document.getElementById('feeAsset').value;
            document.getElementById('feeRate').value = asset === 'BTC' ? 0.012 : 0.01;
            const price = getLiveAssetPrice(asset);
            if (price) document.getElementById('feeEntry').value = price.toFixed(2);
        }

        function initFeeCalcDefaults() {
            const asset = document.getElementById('feeAsset')?.value || 'BTC';
            const entryEl = document.getElementById('feeEntry');
            if (entryEl) {
                const price = getLiveAssetPrice(asset);
                if (price) entryEl.value = price.toFixed(2);
            }
        }

        function calcFeeBreakeven() {
            const side = document.getElementById('feeSide').value;
            const entry = parseFloat(document.getElementById('feeEntry').value);
            const lots = parseFloat(document.getElementById('feeLots').value);
            const qty = lots * LOT_SIZE;
            const feeRatePct = parseFloat(document.getElementById('feeRate').value) || 0.012;
            const feeRate = feeRatePct / 100;

            if (!entry || !lots) { alert('Enter entry price and lots'); return; }

            const notional = entry * qty;
            const openFee = notional * feeRate;
            const closeFee = notional * feeRate; // approx, assumes exit near entry notional
            const totalFee = openFee + closeFee;
            const feePerUnit = totalFee / qty;
            const breakeven = side === 'long' ? entry + feePerUnit : entry - feePerUnit;
            const breakevenPct = (Math.abs(breakeven - entry) / entry * 100);

            document.getElementById('feeNotional').textContent = '$' + notional.toFixed(2) + ` (${lots} lots)`;
            document.getElementById('feeOpen').textContent = '$' + openFee.toFixed(2);
            document.getElementById('feeClose').textContent = '$' + closeFee.toFixed(2);
            document.getElementById('feeTotal').textContent = '$' + totalFee.toFixed(2);
            document.getElementById('feeBreakeven').textContent = '$' + breakeven.toFixed(2);
            document.getElementById('feeBreakevenPct').textContent = breakevenPct.toFixed(4) + '%';

            const sizes = [0.25, 0.5, 1, 2, 5, 10].map(m => notional * m);
            let rows = '';
            sizes.forEach(n => {
                const o = n * feeRate;
                const c = n * feeRate;
                const t = o + c;
                rows += `<tr>
                    <td>$${n.toFixed(2)}</td>
                    <td>$${o.toFixed(2)}</td>
                    <td>$${c.toFixed(2)}</td>
                    <td>$${t.toFixed(2)}</td>
                    <td>${(t / n * 100).toFixed(4)}%</td>
                </tr>`;
            });
            document.getElementById('feeSizeTable').innerHTML = rows;

            // Gross vs Net PnL chart across a price range around entry
            const range = 0.06; // +/-6%
            const steps = 24;
            const low = entry * (1 - range);
            const high = entry * (1 + range);
            const pricePoints = Array.from({length: steps + 1}, (_, i) => low + (high - low) * i / steps);
            let beIdx = 0, beDiff = Infinity;
            pricePoints.forEach((p, i) => { const d = Math.abs(p - breakeven); if (d < beDiff) { beDiff = d; beIdx = i; } });
            pricePoints[beIdx] = breakeven;

            const grossPnl = pricePoints.map(p => side === 'long' ? (p - entry) * qty : (entry - p) * qty);
            const netPnl = grossPnl.map(g => g - totalFee);
            const pointColors = pricePoints.map((p, i) => i === beIdx ? '#dc2626' : (netPnl[i] >= 0 ? '#059669' : '#ff6b6b'));
            const pointRadii = pricePoints.map((p, i) => i === beIdx ? 7 : 2);

            if (chartInstances.feePnl) chartInstances.feePnl.destroy();
            const feeCtx = document.getElementById('feePnlChart');
            if (feeCtx) {
                chartInstances.feePnl = new Chart(feeCtx, {
                    type: 'line',
                    data: {
                        labels: pricePoints.map(p => '$' + p.toFixed(0)),
                        datasets: [
                            {
                                label: 'Gross PnL $',
                                data: grossPnl,
                                borderColor: '#6b7280',
                                borderDash: [4, 3],
                                fill: false,
                                tension: 0.15,
                                pointRadius: 0
                            },
                            {
                                label: 'Net PnL (after fees) $',
                                data: netPnl,
                                borderColor: '#111827',
                                backgroundColor: 'rgba(0,0,0,0.03)',
                                fill: true,
                                tension: 0.15,
                                pointBackgroundColor: pointColors,
                                pointRadius: pointRadii
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: { y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v) => '$' + v.toFixed(0) } } }
                    }
                });
            }
        }