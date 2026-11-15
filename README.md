# J-GET Junior

Приложение для первых шагов в программировании: собирайте команды из блоков, рисуйте персонажей, создавайте истории и игры. Работает без интернета на Windows и Mac.

Текущая версия: **1.3.2-jget.1**. J-GET Junior основан на открытом коде ScratchJr и общественного порта [ScratchJr-Desktop](https://github.com/jfo8000/ScratchJr-Desktop). Это самостоятельная модификация со своим названием и оформлением, не официальный выпуск ScratchJr.

## Скачать и установить

| Система | Файл | Установка |
| --- | --- | --- |
| Windows x64 | [Скачать установщик EXE](https://github.com/user116RUS/J-GET-Junior/releases/latest/download/J-GET-Junior-Setup.exe) | Закройте приложение, запустите установщик и используйте ярлык «J-GET Junior». |
| Mac Intel / Apple Silicon через Rosetta | [Скачать приложение ZIP](https://github.com/user116RUS/J-GET-Junior/releases/download/v1.3.2-jget.1/J-GET-Junior-1.3.2-jget.1-mac-Intel.zip) | Распакуйте архив и перенесите `J-GET Junior.app` в «Программы». |

[Страница релиза](https://github.com/user116RUS/J-GET-Junior/releases/latest) · [Установка и совместимость](docs/JGET-RELEASE.md) · [Памятка для Windows](docs/Windows-класс.txt)

Перед обновлением закройте приложение и сохраните копию папки с проектами. Сборки не имеют цифровой подписи издателя; при первом запуске система может показать предупреждение.

## Возможности

- «Нажата клавиша»: четыре стрелки и все 33 русские буквы, включая Ё.
- «При касании выбранного персонажа»: выбор конкретного персонажа на странице.
- 43 дополнительных звука: животные, природа, музыка, эффекты и техника. Вместе с `pop` доступны 44 встроенных звука.
- Исправления зависания при рисовании и сохранения проектов, сохранение перед закрытием окна.
- На Windows: установка для текущего пользователя и сохранение работ отдельно от файлов приложения.

Для передачи проектов с новыми блоками и звуками используйте J-GET Junior на обоих компьютерах. В исходном ScratchJr Desktop эти возможности отсутствуют.

## Где находятся проекты

Для совместимости с прежними версиями названия каталогов хранения сохранены:

- **Windows:** `%LOCALAPPDATA%\ScratchJr-Classroom\Projects`. Для резервной копии сохраняйте папку целиком, включая `media`. При первом запуске, если этой библиотеки ещё нет, программа копирует работы из «Документы\ScratchJR».
- **Mac:** `~/Documents/ScratchJR`.

J-GET Junior использует библиотеку прежней Classroom-сборки. На Windows исходный ScratchJr Desktop продолжает работать со своей старой библиотекой. Перед копированием библиотеки закройте все версии приложения.

## Разработка

Интерфейс написан на JavaScript и работает в Electron. Используются прежний Electron 1.8.2-beta.3 и SQL.js; это Intel-сборка для Mac и x64-сборка для Windows.

Основные каталоги: `src/app/` — интерфейс и выполнение блоков; `src/main.js` — процесс Electron; `src/projectLibrary.js` и `src/databaseManager.js` — библиотека проектов; `scripts/` — упаковка; `test/` — регрессии.

Сценарии упаковки обновляют исходники и производственный кеш `electron-compile`. Инструкции запуска указаны в начале `scripts/package_windows.py`, `scripts/package_macos_intel.py` и `scripts/build_installer.py`. Готовые пакеты публикуются в GitHub Releases, а не в Git.

[Документация и история проверок](docs/README.md).

## Авторы и лицензии

Сохраняется благодарность авторам [ScratchJr](https://github.com/LLK/scratchjr), общественного [порта для настольных компьютеров](https://github.com/jfo8000/ScratchJr-Desktop), Electron, Electron Forge и SQL.js. Их код и вклад лежат в основе этого приложения.

Для программного кода сохранена [исходная лицензия BSD-3-Clause](LICENSE). Условия товарных знаков находятся в [TRADEMARKS](TRADEMARKS). Новые звуки получены из библиотеки Scratch и распространяются по CC BY-SA 2.0; источники и описание обработки приведены в [ATTRIBUTION.txt](src/app/sounds/library/ATTRIBUTION.txt). У сторонних ресурсов и зависимостей остаются собственные лицензии.

Scratch and ScratchJr are trademarks of Massachusetts Institute of Technology, which does not sponsor, endorse, or authorize this content.
