// ============ APP BOOTSTRAP ============
// Boots the CryptoTerminal engine once every file above has loaded (classic
// scripts execute in the order they're tagged in index.html, sharing one
// global scope — same behavior as the original single-file build, just
// split across files for maintainability).
const app = new CryptoTerminal();
window.addEventListener('resize', () => { if (app.view === 'chart') app.sizeChartWidget(); });
window.addEventListener('orientationchange', () => { setTimeout(() => { if (app.view === 'chart') app.sizeChartWidget(); }, 200); });
