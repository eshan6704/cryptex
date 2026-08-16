        async function loadCryptoData() {
            try {
                // Fetch 100 coins to filter out stablecoins
                const response = await fetchWithTimeout('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=80&page=1&sparkline=false', {}, 8000);
                if (!response.ok) throw new Error('API Error');

                let coins = await response.json();

                // List of stablecoins to exclude (comprehensive list)
                const stablecoins = ['usdt', 'usdc', 'busd', 'dai', 'usdp', 'eur', 'gbp', 'jpy', 'tusd', 'gusd', 'steth', 'beth', 'usds', 'usdx', 'ust', 'frax', 'lusd'];

                // Filter out stablecoins and get top 20 non-stablecoin coins
                let nonStableCoins = coins.filter(coin =>
                    !stablecoins.includes(coin.symbol.toLowerCase())
                );

                // Keep only top 20 non-stablecoins
                nonStableCoins = nonStableCoins.slice(0, 20);

                // Ensure BTC and PAXG are included
                const btc = coins.find(c => c.symbol.toLowerCase() === 'btc');
                const paxg = coins.find(c => c.symbol.toLowerCase() === 'paxg');

                let finalCoins = [...nonStableCoins];

                // Add BTC if not already present
                if (btc && !finalCoins.find(c => c.id === 'bitcoin')) {
                    finalCoins.unshift(btc);
                }

                // Add PAXG if not already present (always include PAXG)
                if (paxg && !finalCoins.find(c => c.id === 'pax-gold')) {
                    finalCoins.push(paxg);
                }

                // Remove duplicates if any
                const seen = new Set();
                finalCoins = finalCoins.filter(coin => {
                    if (seen.has(coin.id)) return false;
                    seen.add(coin.id);
                    return true;
                });

                allCoins = finalCoins;
                updateAllViews();
            } catch (error) {
                console.error('Error:', error);
                alert('Failed to load data');
            }
        }

        function updateAllViews() {
            updateMarketStats();
            updateBTCOptions();
            updateVolumeProfile();
            updatePortfolio();
            refreshToolsLivePricesIfEmpty();
        }

        function refreshToolsLivePricesIfEmpty() {
            const fillIfEmpty = (id, asset) => {
                const el = document.getElementById(id);
                if (el && !el.value) {
                    const price = getLiveAssetPrice(asset);
                    if (price) el.value = price.toFixed(2);
                }
            };
            fillIfEmpty('liqEntry', document.getElementById('liqAsset')?.value || 'BTC');
            fillIfEmpty('feeEntry', document.getElementById('feeAsset')?.value || 'BTC');
            fillIfEmpty('dcaStartPrice', 'BTC');
        }

        function updateMarketStats() {
            const mcap = allCoins.reduce((s, c) => s + (c.market_cap || 0), 0);
            const vol = allCoins.reduce((s, c) => s + (c.total_volume || 0), 0);
            const btcDom = (allCoins[0]?.market_cap || 0) / mcap * 100;

            const elMCap = document.getElementById('statMCap');
            const elVol = document.getElementById('statVol');
            const elDom = document.getElementById('statDom');
            if (elMCap) elMCap.textContent = formatNum(mcap);
            if (elVol) elVol.textContent = formatNum(vol);
            if (elDom) elDom.textContent = `${btcDom.toFixed(1)}%`;
        }

        function formatNum(n) {
            if (!n) return '$0';
            if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
            if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
            if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
            if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
            return `$${n.toFixed(2)}`;
        }