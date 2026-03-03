from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ART_DIR = Path('.agents/webapp-testing/artifacts/post-grid-quality-check')
ART_DIR.mkdir(parents=True, exist_ok=True)


def opacity(page, selector: str) -> float:
    return page.eval_on_selector(selector, "el => parseFloat(getComputedStyle(el).opacity || '0')")


def dataset_flag(page, key: str) -> str:
    value = page.evaluate(f"document.documentElement.dataset['{key}'] || ''")
    return value or ''


def main() -> int:
    results = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1536, "height": 864})
        page = context.new_page()
        page.goto('http://localhost:3000', wait_until='networkidle')
        page.wait_for_timeout(1000)

        page.screenshot(path=str(ART_DIR / '00_home_top.png'), full_page=False)

        quality_selector = '[data-hero-quality-shell]'
        results['quality_opacity_top'] = opacity(page, quality_selector)

        post_zoom_active = False
        y = 0
        for _ in range(26):
            y += 120
            page.evaluate('(scrollY) => window.scrollTo(0, scrollY)', y)
            page.wait_for_timeout(140)
            if dataset_flag(page, 'heroPostZoom') == 'active':
                post_zoom_active = True
                break

        results['post_zoom_active'] = post_zoom_active
        results['scroll_y_post_zoom'] = y
        results['quality_opacity_post_zoom'] = opacity(page, quality_selector)
        page.screenshot(path=str(ART_DIR / '01_home_post_zoom.png'), full_page=False)

        page.locator('#gallery').scroll_into_view_if_needed()
        page.wait_for_timeout(700)
        page.screenshot(path=str(ART_DIR / '02_gallery_entry.png'), full_page=False)

        medovik = '[data-gallery-medovik]'
        macarons = '[data-gallery-macarons]'
        results['medovik_opacity_entry'] = opacity(page, medovik)
        results['macarons_opacity_entry'] = opacity(page, macarons)

        page.evaluate('window.scrollBy(0, 520)')
        page.wait_for_timeout(850)
        page.screenshot(path=str(ART_DIR / '03_gallery_mid.png'), full_page=False)
        results['medovik_opacity_mid'] = opacity(page, medovik)
        results['macarons_opacity_mid'] = opacity(page, macarons)

        cta = '[data-gallery-hazelnut] a[aria-label="Enter gallery"]'
        cake = page.locator('[data-gallery-hazelnut]').first
        cake_img = '[data-gallery-hazelnut] [role="img"]'

        results['cta_opacity_before_hover'] = opacity(page, cta)
        transform_before = page.eval_on_selector(cake_img, "el => getComputedStyle(el).transform")

        cake.hover()
        page.wait_for_timeout(280)
        results['cta_opacity_after_hover'] = opacity(page, cta)
        transform_after = page.eval_on_selector(cake_img, "el => getComputedStyle(el).transform")
        results['cake_transform_before'] = transform_before
        results['cake_transform_after'] = transform_after
        page.screenshot(path=str(ART_DIR / '04_gallery_hover.png'), full_page=False)

        browser.close()

    score = 0
    checks = {}

    checks['quality_hidden_top'] = results['quality_opacity_top'] <= 0.12
    score += 15 if checks['quality_hidden_top'] else 0

    checks['quality_visible_post_zoom'] = results['post_zoom_active'] and results['quality_opacity_post_zoom'] >= 0.72
    score += 15 if checks['quality_visible_post_zoom'] else 0

    checks['side_hidden_entry'] = results['medovik_opacity_entry'] <= 0.15 and results['macarons_opacity_entry'] <= 0.15
    score += 25 if checks['side_hidden_entry'] else 0

    checks['side_visible_mid'] = results['medovik_opacity_mid'] >= 0.6 and results['macarons_opacity_mid'] >= 0.6
    score += 25 if checks['side_visible_mid'] else 0

    checks['cta_hidden_before_hover'] = results['cta_opacity_before_hover'] <= 0.12
    score += 5 if checks['cta_hidden_before_hover'] else 0

    checks['cta_visible_on_hover'] = results['cta_opacity_after_hover'] >= 0.7
    score += 5 if checks['cta_visible_on_hover'] else 0

    checks['tilt_applied_on_hover'] = (
        results['cake_transform_before'] != results['cake_transform_after']
        and results['cake_transform_after'] != 'none'
    )
    score += 10 if checks['tilt_applied_on_hover'] else 0

    report = {
        'score': score,
        'checks': checks,
        'metrics': results,
    }

    (ART_DIR / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (ART_DIR / 'summary.txt').write_text(
        '\n'.join([
            f"score={score}/100",
            *(f"{k}={v}" for k, v in checks.items()),
            *(f"{k}={v}" for k, v in results.items()),
        ]),
        encoding='utf-8'
    )

    print(json.dumps(report, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

