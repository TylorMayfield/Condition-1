import { test, expect } from '@playwright/test';

test('Game Smoke Test - Main Menu and Start', async ({ page }) => {
    // 1. Go to Game URL
    await page.goto('/');

    // 2. Check for Main Menu Container
    const menu = page.locator('.menu-container');
    await expect(menu).toBeVisible({ timeout: 10000 });

    // 3. Verify Title/Buttons
    await expect(page.locator('h1')).toContainText('CONDITION-1');
    const startBtn = page.locator('#btn-resume'); // Actually 'Resume' is hidden initially? No, New Game is visible.
    // Wait, let's verify buttons.
    // "New Game" -> Panel Maps -> Select Map -> Start

    // Since we want a quick check, verify visual presence first.

    // 4. Start a New Game (Click New Game -> Click Generated Test Map)
    await page.click('#btn-new-game');
    await expect(page.locator('#panel-maps')).toBeVisible();

    // Find a map card (should be some)
    const mapCards = page.locator('.map-card');
    expect(await mapCards.count()).toBeGreaterThan(0);

    // 5. Test closes successfully
    console.log('Smoke Test Passed: Menu loaded and map list visible.');
});

test('Game Canvas Exists', async ({ page }) => {
    await page.goto('/');
    // Canvas should be present immediately (Three.js app)
    const canvas = page.locator('canvas');
    await expect(canvas).toBeAttached();
});
