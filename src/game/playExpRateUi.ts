import { formatExpRateLabel } from '../../shared/gameRates';
import { getPlayExpRate } from '../game-data/gameRates';

export function updatePlayHudExpRateBanner(rateExp?: number): void {
    const el = document.getElementById('playHudExpRateBanner');
    if (!el) return;

    const rate = rateExp ?? getPlayExpRate();
    const label = formatExpRateLabel(rate);
    if (!label) {
        el.hidden = true;
        el.textContent = '';
        return;
    }

    el.hidden = false;
    el.textContent = label;
}
