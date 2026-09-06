# GPT Image → Blender: город и транспорт

Генерация: встроенный GPT Image (не CLI/API). Изображения служат художественными референсами; игровые GLB собраны локальными bpy-скриптами, а не автоматически извлечены из фотографий. Интерьеры, оборудование и персонажи в этом этапе не менялись.

## Сохранённые референсы и точные промпты

### artifacts/references/city-aerial.png

Use case: stylized-concept. Asset type: architectural reference for rebuilding an existing 3D city-building game in Blender. Create a highly detailed wide aerial architectural visualization of a large coherent contemporary city: dense but readable blocks, continuous clean asphalt road grid, realistic human-scale sidewalks, varied midrise masonry apartment blocks with deep window reveals, glass business towers with podiums, a low industrial technology district, and two large data-center campuses on the outskirts. Premium polished miniature architectural model aesthetic, physically plausible proportions and materials, softly bevelled edges, warm late afternoon sun, muted brick stone and blue glass, rich shadow depth. Camera three-quarter aerial, entire bounded city visible with developed edges, no enormous empty ground slab. Roads logically connected with no broken intersections. No UI, no text, no watermarks. This is a modeling reference, emphasize achievable solid architectural forms rather than painterly detail.

### artifacts/references/city-architecture.png

Use case: stylized-concept. Create a detailed architectural modeling reference sheet for a premium contemporary 3D city game, four clearly separated large views of a coherent city district: aerial three-quarter block view; close street-level view of brick midrise buildings; glass office tower with stepped podium; low technology workshop campus with clean industrial facade. Realistic architecture translated into elegant miniature architectural visualization, bevelled masonry, recessed repeated windows, restrained bronze and blue glass, rooftop mechanical units, arcades and entrance canopies, continuous sidewalks and realistic roads. Warm daylight. Make forms and facade construction clear enough to rebuild in Blender, no painterly haze. No UI or lettering or watermark. Urban density without giant blank slabs.

### artifacts/references/vehicle-lineup.png

Use case: product-mockup. Asset type: multi-view vehicle modeling reference board for a premium 3D city game. Six separate vehicle rows on a neutral studio background, each showing consistent front three-quarter and rear three-quarter views of that same vehicle: teal modern four-door sedan; ivory compact delivery van; coral modern hatchback; black widebody muscle coupe with four circular headlights and rear spoiler; black urban shuttle bus with silver window trim and rooftop HVAC; bright yellow compact sedan taxi with checker markings and roof TAXI sign. Detailed physically realistic automotive forms: smoothly curved integrated body panels and fenders, recessed lamps, wheels inside real wheel arches, thin flush glazing pillars, correctly sized mirrors, inset door seams. Make all 12 vehicles fully visible and separate, proportionally consistent within each row. Strong clean geometry references for Blender modeling, soft studio reflections revealing surface curvature. No exploded parts, no chunky block toy proportions, no watermark, no manufacturer logos.

## Игровые модели

- Город: artifacts/city/Metropolis_Reference_v5.blend. Скрипт tools/build_reference_city.py; стабильная раскладка — artifacts/city/reference-layout.json. Сохранены 12 интерактивных идентификаторов, маршруты людей и транспорта, масштаб карты и покупки. Экспорт разбит на 37 пространственных групп; материалы общие с цветом вершин.
- Машины 1, 2, 3, 5, 6: artifacts/actors/reference-v2/car-N.blend; tools/build_reference_vehicles.py. Модели кузовов с настоящими вырезами арок, сглаженными поверхностями и общими материалами.
- Купе 4 после замечания пользователя: artifacts/actors/hero-coupe/coupe-master.blend — мастер в метрах; artifacts/actors/hero-coupe/car-4.blend — масштаб игры. tools/build_hero_coupe.py создаёт проверяемый экспорт рядом с исходником; после осмотра car-4.glb скопирован в public/models/actors, а бюджет и source обновлены в манифесте. Редкость 10% раз в 6 игровых часов сохраняется.
- Рендеры реальных моделей: artifacts/city/reference-city-overview.png, reference-city-detail.png; artifacts/actors/reference-v2/car-N.png; artifacts/actors/hero-coupe/front.png и rear.png.

Все пути относительны корню проекта. artifacts исключён из Git, но файлы сохранены локально. Референсы — концепт, не обещание точного фотореалистичного совпадения игровой модели. Крупные рендеры моделей позволяют оценить фактический результат отдельно от GPT Image.

## Проверки

245 модульных тестов и production-сборка прошли. tools/verify_visual_assets.py повторно импортирует экспорты Blender и проверяет размеры, треугольники и интерактивные имена; итоговый отчёт artifacts/visual-offline-verification.json. Текущий бюджет города — artifacts/city/reference-city-budget.json; машин — public/models/actors/manifest.json.

По указанию пользователя браузерное прохождение и клики не выполнялись. FPS не измерен: сжатие и группировка снижают загрузку и число вызовов отрисовки, но сами по себе не доказывают отсутствие задержек. Сборщик сохраняет предупреждение о размере общего чанка Three.js/Draco.

## Публикация на GitHub

В репозиторий явно включены актуальные исходники Blender из манифестов, мастер купе, исходная сцена v4 для сборщика города, стабильная раскладка и три референса GPT Image. Эти выбранные файлы отслеживаются Git, несмотря на общее правило artifacts/ в .gitignore. Остальные промежуточные рендеры и старые версии остаются локальными.
