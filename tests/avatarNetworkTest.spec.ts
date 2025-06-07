import { test } from '@playwright/test';

test.describe.parallel('Each session creates one avatar and receives 19 others', () => {
  for (let i = 0; i < 20; i++) {
    test(`Session ${i + 1}`, async ({ page }) => {
      const avatarID = `BUTO${i + 1}`;
      const userName = `User${i + 1}`;

      // 1. Load your live site
      await page.goto('https://NimrodH.github.io/carShareProg/index.html', { waitUntil: 'load', timeout: 60000 });

      // 2. Wait for Babylon scene to initialize
      await page.waitForFunction(() => window.myWorld && window.myWorld.wellcomeDone, { timeout: 40000 });

      // 3. Create just this session's avatar
      await page.evaluate(({ avatarID, userName }) => {
        window.myWorld.wellcomeDone({
          avatarID,
          isMan: Math.random() < 0.5,
          address: "AutoTestLand",
          day1to: "08:00",
          day1back: "16:00",
          day2to: "",
          day2back: "",
          day3to: "",
          day3back: "",
          day4to: "",
          day4back: "",
          day5to: "",
          day5back: "",
          userName
        });
      }, { avatarID, userName });

      // 4. Wait until all 20 avatars have been received from the server
      await page.waitForFunction(() => {
        return window.myWorld && window.myWorld._avatarsArr?.length === 10;
      }, { timeout: 45000 });//30000

      console.log(`✅ Session ${i + 1}: sees  10 avatars`);
    });
  }
});
