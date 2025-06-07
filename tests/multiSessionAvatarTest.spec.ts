import { test, expect } from '@playwright/test';

test.describe.parallel('20-session avatar loading test', () => {
  for (let i = 0; i < 20; i++) {
    test(`Session ${i + 1}`, async ({ page }) => {
      const avatarID = `U${i + 1}`;
      const userName = `User ${i + 1}`;

      // 1. Load the deployed site
      await page.goto('https://NimrodH.github.io/carShareProg/index.html', { waitUntil: 'load', timeout: 30000 });

      // 2. Inject avatar creation logic
      await page.evaluate(({ avatarID, userName }) => {
        window.myWorld?.wellcomeDone({
          avatarID,
          isMan: Math.random() < 0.5,
          address: "AutoTestLand",
          day1to: "08:00",
          day1back: "16:00",
          day2to: "08:00",
          day2back: "16:00",
          day3to: "",
          day3back: "",
          day4to: "",
          day4back: "",
          day5to: "",
          day5back: "",
          userName
        });
      }, { avatarID, userName });

      // 3. Wait until 20 avatars are visible in this session
      await page.waitForFunction(() => {
        return window.myWorld?._avatarsArr?.length >= 20;
      }, { timeout: 30000 });

      console.log(`✅ Session ${i + 1}: sees all 20 avatars`);
    });
  }
});
