import json
import logging
import sys

import pdfplumber
from pypdf import PdfReader

logging.getLogger("pdfminer").setLevel(logging.ERROR)


def inspect(path):
    reader = PdfReader(path)
    pages = []
    invalid = []
    with pdfplumber.open(path) as document:
        for index, page in enumerate(document.pages):
            pages.append(reader.pages[index].extract_text() or "")
            for char in page.chars:
                if char["x0"] < -1 or char["x1"] > page.width + 1 or char["top"] < -1 or char["bottom"] > page.height + 1:
                    invalid.append({"page": index + 1, "text": char["text"]})
    return {"pages": pages, "pageCount": len(pages), "outsidePage": invalid,
            "a4": all(abs(float(page.mediabox.width) - 595.28) < 2 and abs(float(page.mediabox.height) - 841.89) < 2 for page in reader.pages)}


print(json.dumps(inspect(sys.argv[1]), ensure_ascii=True))
