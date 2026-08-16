        function pxSubTab(group, name, btnEl) {
            const container = document.getElementById('view-px-' + group);
            if (!container) return;
            container.querySelectorAll('.px-inner').forEach(el => el.classList.remove('active'));
            container.querySelectorAll('.px-subtab-btn').forEach(b => b.classList.remove('active'));
            const target = document.getElementById(name);
            if (target) target.classList.add('active');
            if (btnEl) btnEl.classList.add('active');

            if (group === 'tools') {
                if (name === 'portfolio' && typeof initPortfolioDefaults === 'function') initPortfolioDefaults();
                if (name === 'liqcalc' && typeof initLiqCalcDefaults === 'function') initLiqCalcDefaults();
                if (name === 'dcaplanner' && typeof initDCADefaults === 'function') initDCADefaults();
                if (name === 'feecalc' && typeof initFeeCalcDefaults === 'function') initFeeCalcDefaults();
            }
        }

        function pxAnalyzeCoin(coinId, navigate = true) {
            if (typeof app !== 'undefined' && app.coins && app.coins.length) {
                allCoins = app.coins;
            }
            if (typeof viewCoinAnalysis === 'function') viewCoinAnalysis(coinId, navigate);
        }

        function viewCoinAnalysis(coinId, navigate = true) {
            const coin = allCoins.find(c => c.id === coinId);
            if (!coin) return;

            selectedCoin = coin;

            // Update coin info
            const ath = coin.ath || 0;
            const atl = coin.atl || 0;
            const athPercent = coin.current_price && ath ? ((coin.current_price / ath) * 100 - 100).toFixed(1) : 'N/A';

            document.getElementById('coinTitle').textContent = `📊 ${coin.name} (${coin.symbol.toUpperCase()})`;
            document.getElementById('coinPrice').textContent = `$${coin.current_price?.toLocaleString('en-US', {maximumFractionDigits: 2})}`;

            const change24h = coin.price_change_percentage_24h || 0;
            document.getElementById('coin24h').innerHTML = `<span style="color: ${change24h > 0 ? '#059669' : '#dc2626'};">${change24h > 0 ? '▲' : '▼'} ${Math.abs(change24h).toFixed(2)}%</span>`;

            document.getElementById('coinMCap').textContent = formatNum(coin.market_cap);
            document.getElementById('coinVol').textContent = formatNum(coin.total_volume);
            document.getElementById('coinSupply').textContent = coin.circulating_supply ? coin.circulating_supply.toLocaleString('en-US', {maximumFractionDigits: 0}) : '-';
            document.getElementById('coinATH').textContent = `$${ath.toFixed(2)} / $${atl.toFixed(2)} (${athPercent}%)`;

            // Generate mock data for analysis
            updateCoinChart(coin);
            updateCoinIndicators(coin);
            updateSMCAnalysis(coin);
            updateICTAnalysis(coin);
            updatePivotAnalysis(coin);

            // Switch to coin analysis view (unless caller just wants the data refreshed in place)
            if (navigate) app.setView('px-analysis');
        }

        function updateCoinIndicators(coin) {
            const rsi = Math.random() * 100;
            const macd = (Math.random() - 0.5) * 0.01;
            const stoch = Math.random() * 100;
            const atr = coin.current_price * (Math.random() * 0.05 + 0.01);
            const volTrend = Math.random() > 0.5 ? '📈 Increasing' : '📉 Decreasing';
            const volatility = (Math.random() * 50 + 10).toFixed(1);
            window.coinIndicatorData = { rsi, macd, atr, stoch, volatility };

            document.getElementById('coinRSI').innerHTML = `<span style="color: ${rsi > 70 ? '#dc2626' : rsi < 30 ? '#059669' : '#111827'};">${rsi.toFixed(1)}</span>`;
            document.getElementById('coinMACD').textContent = macd.toFixed(5);
            document.getElementById('coinStoch').innerHTML = `<span style="color: ${stoch > 80 ? '#dc2626' : stoch < 20 ? '#059669' : '#111827'};">${stoch.toFixed(1)}</span>`;
            document.getElementById('coinATR').textContent = atr.toFixed(2);
            document.getElementById('coinVolTrend').textContent = volTrend;
            document.getElementById('coinVolatility').textContent = volatility + '%';
        }

        function updatePivotAnalysis(coin) {
            const price = coin.current_price;
            const idata = window.coinIndicatorData || {};
            const atr = idata.atr || price * 0.02;
            const rsi = idata.rsi !== undefined ? idata.rsi : 50;

            // Simulated daily range (proxy since no real OHLC feed)
            const high = price + atr * (0.6 + Math.random() * 0.4);
            const low = price - atr * (0.6 + Math.random() * 0.4);
            const close = price;
            const pp = (high + low + close) / 3;
            const levels = {
                'R3': high + 2 * (pp - low),
                'R2': pp + (high - low),
                'R1': 2 * pp - low,
                'Pivot': pp,
                'S1': 2 * pp - high,
                'S2': pp - (high - low),
                'S3': low - 2 * (high - pp)
            };

            // Moving averages (simulated relative offsets)
            const ma20 = price * (1 + (Math.random() - 0.5) * 0.01);
            const ma50 = price * (1 + (Math.random() - 0.5) * 0.03);
            const ma200 = price * (1 + (Math.random() - 0.5) * 0.08);
            let trendDir = 'Sideways / Mixed';
            if (price > ma20 && ma20 > ma50 && ma50 > ma200) trendDir = '📈 Strong Uptrend (Bullish Alignment)';
            else if (price < ma20 && ma20 < ma50 && ma50 < ma200) trendDir = '📉 Strong Downtrend (Bearish Alignment)';
            else if (price > ma50) trendDir = '↗️ Uptrend Bias';
            else if (price < ma50) trendDir = '↘️ Downtrend Bias';

            const adx = Math.random() * 60 + 10;
            const adxLabel = adx > 40 ? 'Strong' : adx > 20 ? 'Moderate' : 'Weak/Ranging';

            const bbUpper = price * 1.03, bbLower = price * 0.97;
            const bbPos = ((price - bbLower) / (bbUpper - bbLower) * 100);
            const bbLabel = bbPos > 90 ? 'Upper Band (Overbought)' : bbPos < 10 ? 'Lower Band (Oversold)' : 'Mid-Range';

            const volRegime = (idata.volatility || 20) > 35 ? 'High Volatility' : (idata.volatility || 20) > 18 ? 'Normal' : 'Low Volatility (Compression)';

            // Composite bias score blending RSI, trend, ADX
            let bias = 50;
            bias += (rsi - 50) * 0.4;
            bias += (price > ma50 ? 1 : -1) * Math.min(adx, 40) * 0.5;
            bias = Math.max(0, Math.min(100, bias));
            const biasLabel = bias > 65 ? 'Bullish' : bias < 35 ? 'Bearish' : 'Neutral';

            document.getElementById('coinTrendDir').textContent = trendDir;
            document.getElementById('coinADX').textContent = adx.toFixed(1) + ' (' + adxLabel + ')';
            document.getElementById('coinMAPos').textContent = `${price > ma20 ? '>' : '<'}MA20, ${price > ma50 ? '>' : '<'}MA50, ${price > ma200 ? '>' : '<'}MA200`;
            document.getElementById('coinBBPos').textContent = bbPos.toFixed(0) + '% (' + bbLabel + ')';
            document.getElementById('coinVolRegime').textContent = volRegime;
            document.getElementById('coinBiasScore').innerHTML = `<span style="color:${bias > 65 ? '#059669' : bias < 35 ? '#dc2626' : '#111827'};">${bias.toFixed(0)}/100 (${biasLabel})</span>`;

            window.coinPivotLevels = { ...levels, price };
            const rows = Object.entries(levels)
                .sort((a, b) => b[1] - a[1])
                .map(([label, lvl]) => {
                    const dist = ((lvl - price) / price * 100);
                    const type = label === 'Pivot' ? 'Pivot' : lvl > price ? 'Resistance' : 'Support';
                    return `<tr>
                        <td><strong>${label}</strong></td>
                        <td>$${lvl.toLocaleString('en-US', {maximumFractionDigits: 2})}</td>
                        <td style="color:${dist >= 0 ? '#dc2626' : '#059669'};">${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%</td>
                        <td style="color:${type === 'Resistance' ? '#dc2626' : type === 'Support' ? '#059669' : '#6b7280'};">${type}</td>
                    </tr>`;
                }).join('');
            document.getElementById('coinPivotTable').innerHTML = rows;
        }

        function updateSMCAnalysis(coin) {
            const price = coin.current_price;

            document.getElementById('smcOrderBlocks').innerHTML = `
                <span style="color: #dc2626; font-weight: 600;">$${(price * 0.95).toFixed(2)}</span><br>
                <span class="u73">Resistance Block</span>
            `;

            document.getElementById('smcMitigation').innerHTML = `
                <span style="color: ${Math.random() > 0.5 ? '#059669' : '#dc2626'}; font-weight: 600;">${Math.random() > 0.5 ? '✓ Mitigated' : 'Pending'}</span>
            `;

            document.getElementById('smcLiquidity').innerHTML = `
                <span style="color: #2563eb; font-weight: 600;">$${(price * (0.9 + Math.random() * 0.2)).toFixed(2)}</span><br>
                <span class="u73">Accumulation Zone</span>
            `;

            document.getElementById('smcStructure').textContent = Math.random() > 0.5 ? '📈 Bullish' : '📉 Bearish';

            document.getElementById('smcBOS').innerHTML = `
                <span style="color: ${Math.random() > 0.5 ? '#059669' : '#dc2626'}; font-weight: 600;">
                    ${Math.random() > 0.5 ? 'Break Up' : 'Break Down'}
                </span>
            `;

            const fib1 = price * 0.618;
            const fib2 = price * 0.786;
            document.getElementById('smcFib').innerHTML = `
                $${fib1.toFixed(2)} / $${fib2.toFixed(2)}
            `;
        }

        function updateICTAnalysis(coin) {
            const price = coin.current_price;

            document.getElementById('ictEquilibrium').innerHTML = `
                <span style="color: #111827; font-weight: 600;">$${(price * (1 + (Math.random() - 0.5) * 0.02)).toFixed(2)}</span><br>
                <span class="u73">Mid Price</span>
            `;

            document.getElementById('ictFVG').innerHTML = `
                <span style="color: #2563eb; font-weight: 600;">$${(price * (1 + (Math.random() - 0.5) * 0.03)).toFixed(2)}</span><br>
                <span class="u73">Imbalance Zone</span>
            `;

            document.getElementById('ictImbalance').innerHTML = `
                <span style="color: #dc2626; font-weight: 600;">$${(price * 1.05).toFixed(2)}</span>
            `;

            document.getElementById('ictInducement').innerHTML = `
                <span style="color: #059669; font-weight: 600;">$${(price * 0.98).toFixed(2)}</span><br>
                <span class="u73">Liquidity Pool</span>
            `;

            document.getElementById('ictOTE').innerHTML = `
                <span style="color: #111827; font-weight: 600;">$${(price * (1 + (Math.random() - 0.5) * 0.015)).toFixed(2)}</span><br>
                <span class="u73">Entry Level</span>
            `;

            document.getElementById('ictLiquidity').textContent = Math.random() > 0.5 ? '✓ Available' : '✗ Swept';
        }