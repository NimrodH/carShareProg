import { test } from '@playwright/test';

test('create two avatars and start chat', async ({ page }) => {
  await page.goto('https://NimrodH.github.io/carShareProg/index.html'); // 🔁 Change to your real URL if deployed

  // 1. Inject Avatar A
  await page.evaluate(() => {
    window.myWorld.wellcomeDone({
      avatarID: 'A1',
      isMan: true,
      address: 'Location A',
      day1to: '08:00',
      day1back: '17:00',
      day2to: '',
      day2back: '',
      day3to: '',
      day3back: '',
      day4to: '',
      day4back: '',
      day5to: '',
      day5back: '',
      userName: 'Avatar A',
    });
  });

  await page.waitForFunction(() => !!window.myWorld?.myAvatar?.avatarMesh);

  // 2. Inject Avatar B (simulate another client in same scene)
  await page.evaluate(() => {
    const avatarDetails = {
      avatarURL: window.myWorld.myAvatar.avatarURL,
      x: 1,
      y: 0,
      z: 1,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
    };
    const signData = {
      avatarID: 'B1',
      isMan: false,
      address: 'Location B',
      day1to: '09:00',
      day1back: '18:00',
      day2to: '',
      day2back: '',
      day3to: '',
      day3back: '',
      day4to: '',
      day4back: '',
      day5to: '',
      day5back: '',
      userName: 'Avatar B',
    };
    window.myWorld.addAvatar2World(avatarDetails, signData, false, window.scene);
  });

  // 3. Wait for second avatar to appear
  await page.waitForFunction(() => window.myWorld._avatarsArr.length === 2);

  // 4. Start chat from Avatar A to Avatar B
  await page.evaluate(() => {
    window.myWorld.chatRequest('B1');
  });

  // 5. Wait for chat object to be created
  await page.waitForFunction(() => !!window.myWorld.currChat);

  // 6. Optionally assert chat state exists
  const chatId = await page.evaluate(() => window.myWorld.currChat.chatID);
  console.log(`Chat started: ${chatId}`);

  // 7. Wait to observe chat dialog (optional)
  await page.waitForTimeout(5000);
});
