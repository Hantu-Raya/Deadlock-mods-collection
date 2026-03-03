from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ART_DIR = Path('.agents/webapp-testing/artifacts/post-grid-title-hide-check')
ART_DIR.mkdir(parents=True, exist_ok=True)


def read_style(page, selector: str) -> dict:
    return page.eval_on_selector(
        selector,
        """el => {
            const s = getComputedStyle(el);
            return {
                opacity: parseFloat(s.opacity || '0'),
                visibility: s.visibility,
                display: s.display,
                pointerEvents: s.pointerEvents,
                transform: s.transform,
            };
        }""",
    )


def main() -> int:
    report = {
        'samples': [],
        'console': [],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1536, "height": 864})

        def on_console(msg):
            report['console'].append({'type': msg.type, 'text': msg.text})

        page.on('console', on_console)
        page.goto('http://localhost:3000', wait_until='networkidle')
        page.wait_for_timeout(900)

        title_sel = '[data-hero-title]'
        lede_sel = '[data-hero-lede]'
        quality_sel = '[data-hero-quality-shell]'

        def sample(label: str):
            post_zoom = page.evaluate("document.documentElement.dataset.heroPostZoom || ''")
            sample_row = {
                'label': label,
                'scrollY': page.evaluate('window.scrollY'),
                'post_zoom': post_zoom,
                'title': read_style(page, title_sel),
                'lede': read_style(page, lede_sel),
                'quality': read_style(page, quality_sel),
            }
            report['samples'].append(sample_row)
            return sample_row

        sample('top')
        page.screenshot(path=str(ART_DIR / '00_top.png'), full_page=False)

        y = 0
        post_zoom_found = False
        for i in range(30):
            y += 120
            page.evaluate('(scrollY) => window.scrollTo(0, scrollY)', y)
            page.wait_for_timeout(120)
            row = sample(f'down_{i:02d}')
            if row['post_zoom'] == 'active':
                post_zoom_found = True
                page.screenshot(path=str(ART_DIR / '01_post_zoom.png'), full_page=False)
                break

        # Scroll more to ensure state persists after handoff section leaves.
        page.evaluate('(scrollY) => window.scrollTo(0, scrollY)', y + 900)
        page.wait_for_timeout(220)
        sample('after_leave')
        page.screenshot(path=str(ART_DIR / '02_after_leave.png'), full_page=False)

        browser.close()

    post_zoom_samples = [s for s in report['samples'] if s['post_zoom'] == 'active']
    persisted = next((s for s in report['samples'] if s['label'] == 'after_leave'), None)

    report['post_zoom_seen'] = post_zoom_found
    report['pass_title_hidden_in_post_zoom'] = bool(post_zoom_samples) and all(s['title']['opacity'] <= 0.12 for s in post_zoom_samples)
    report['pass_lede_hidden_in_post_zoom'] = bool(post_zoom_samples) and all(s['lede']['opacity'] <= 0.12 for s in post_zoom_samples)
    report['pass_quality_hidden_in_post_zoom'] = bool(post_zoom_samples) and all(s['quality']['opacity'] <= 0.12 for s in post_zoom_samples)
    report['pass_title_stays_hidden_after_leave'] = bool(persisted) and persisted['post_zoom'] == 'active' and persisted['title']['opacity'] <= 0.12
    report['score'] = 100 if (
        report['pass_title_hidden_in_post_zoom']
        and report['pass_lede_hidden_in_post_zoom']
        and report['pass_quality_hidden_in_post_zoom']
        and report['pass_title_stays_hidden_after_leave']
    ) else 0

    (ART_DIR / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (ART_DIR / 'summary.txt').write_text('\n'.join([
        f"post_zoom_seen={report['post_zoom_seen']}",
        f"pass_title_hidden_in_post_zoom={report['pass_title_hidden_in_post_zoom']}",
        f"pass_lede_hidden_in_post_zoom={report['pass_lede_hidden_in_post_zoom']}",
        f"pass_quality_hidden_in_post_zoom={report['pass_quality_hidden_in_post_zoom']}",
        f"pass_title_stays_hidden_after_leave={report['pass_title_stays_hidden_after_leave']}",
        f"score={report['score']}",
    ]), encoding='utf-8')

    print(json.dumps(report, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
