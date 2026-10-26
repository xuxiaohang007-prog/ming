import sys
from pathlib import Path

from PIL import Image, ImageDraw

directory = Path(sys.argv[1])
for prefix in (sys.argv[2:] or ("standard-report", "long-report")):
    pages = sorted(directory.glob(f"{prefix}-*.png"), key=lambda file: int(file.stem.rsplit("-", 1)[1]))
    for start in range(0, len(pages), 6):
        sheet = Image.new("RGB", (1000, 2184), "#e7e7e7")
        draw = ImageDraw.Draw(sheet)
        for index, file in enumerate(pages[start:start + 6]):
            with Image.open(file) as page:
                page.thumbnail((480, 680))
                x, y = 10 + (index % 2) * 500, 26 + (index // 2) * 728
                sheet.paste(page, (x, y))
                draw.text((x, y - 18), file.name, fill="black")
        sheet.save(directory / f"review-{prefix}-{start // 6 + 1}.png")
