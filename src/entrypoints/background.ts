export default defineBackground(() => {
  // Clic sur l'icône : ouvre l'application plein onglet.
  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL('/app.html') });
  });
});
