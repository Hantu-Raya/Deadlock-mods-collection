from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ART_DIR = Path('.agents/webapp-testing/artifacts/post-grid-hidden-check')
ART_DIR.mkdir(parents=True, exist_ok=True)


def opacity(page, selector: str) -> float:
    return page.eval_on_selector(selector, "el => parseFloat(getComputedStyle(el).opacity || '0')")


def main() -> int:
    report = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1536, "height": 864})
        page.goto('http://localhost:3000', wait_until='networkidle')
        page.wait_for_timeout(1000)

        selector = '[data-hero-quality-shell]'
        report['opacity_top'] = opacity(page, selector)
        page.screenshot(path=str(ART_DIR / '00_top.png'), full_page=False)

        post_zoom = False
        y = 0
        for _ in range(26):
            y += 120
            page.evaluate('(scrollY) => window.scrollTo(0, scrollY)', y)
            page.wait_for_timeout(140)
            state = page.evaluate("document.documentElement.dataset.heroPostZoom || ''")
            if state == 'active':
                post_zoom = True
                break

        report['post_zoom_active'] = post_zoom
        report['scroll_y_post_zoom'] = y
        report['opacity_post_zoom'] = opacity(page, selector)
        page.screenshot(path=str(ART_DIR / '01_post_zoom.png'), full_page=False)
        browser.close()

    report['pass_hidden_after_grid'] = report['post_zoom_active'] and report['opacity_post_zoom'] <= 0.1
    report['score'] = 100 if report['pass_hidden_after_grid'] else 0

    (ART_DIR / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (ART_DIR / 'summary.txt').write_text(
        '\n'.join([f"{k}={v}" for k, v in report.items()]),
        encoding='utf-8'
    )
    print(json.dumps(report, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
