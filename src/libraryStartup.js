// Keep first-run recovery separate from ordinary reads and write failures.
// Electron 1.8 showMessageBox returns a button index when no callback is given.
function openStartupLibrary(library, dialog, locale) {
  try {
    return library.open();
  } catch (error) {
    if (error.code !== 'LEGACY_LIBRARY_INVALID') throw error;
    const russian = /^ru/i.test(locale);
    const choice = dialog.showMessageBox({
      type: 'warning',
      title: 'ScratchJGET',
      message: russian
        ? 'Не удалось прочитать старую библиотеку ScratchJr.'
        : 'The old ScratchJr library could not be read.',
      detail: (russian
        ? 'Можно начать с пустой библиотекой. Старые файлы останутся без изменений в указанной папке, но прежние проекты не появятся в новой библиотеке. Если они нужны, закройте программу и сохраните эту папку для восстановления.\n\n'
        : 'You can start with an empty library. The old files will stay unchanged in the location below, but old projects will not appear in the new library. If you need them, close the app and keep that folder for recovery.\n\n') + error.sourceFile,
      buttons: russian ? ['Начать с пустой библиотекой', 'Закрыть'] : ['Start with an empty library', 'Close'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    if (choice !== 0) return null;
    return library.startFresh(error);
  }
}

module.exports = openStartupLibrary;
