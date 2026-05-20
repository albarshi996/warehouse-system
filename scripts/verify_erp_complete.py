import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        base_url = "http://localhost:4323/brandzo-hub-documentation"

        # 1. Verify ERP Workflows Page
        print("Checking ERP Workflows page...")
        await page.goto(f"{base_url}/dashboard/erp-workflows")
        await page.wait_for_selector("h1")

        title = await page.inner_text("h1")
        print(f"Page Title: {title}")

        # Check tabs
        tabs = ["finance", "hr", "procurement"]
        for tab in tabs:
            print(f"Testing tab: {tab}")
            await page.click(f"button[data-tab='{tab}']")
            await asyncio.sleep(1) # Wait for animation/mermaid

            content_id = f"{tab}-content"
            is_visible = await page.is_visible(f"#{content_id}")
            print(f"Tab {tab} content visible: {is_visible}")

            # Check for mermaid svg or container
            mermaid_visible = await page.is_visible(f"#{content_id} .mermaid")
            print(f"Mermaid container in {tab} visible: {mermaid_visible}")

            await page.screenshot(path=f"erp_{tab}_verified.png")

        # 2. Verify FAQ Section in Workflows Page
        print("\nChecking FAQ in Workflows page...")
        await page.goto(f"{base_url}/dashboard/workflows")

        faq_header = await page.wait_for_selector("text=الأسئلة الشائعة")
        print(f"FAQ Section found: {await faq_header.inner_text()}")

        # Test Search
        search_input = await page.query_selector("input[placeholder*='ابحث']")
        await search_input.fill("Odoo")
        await asyncio.sleep(1)

        results_count = await page.locator("button span:has-text('أودو')").count()
        print(f"Search results for 'Odoo': {results_count}")

        await page.screenshot(path="workflows_faq_verified.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
