# Нарезка сетки иконок 4x5 на отдельные PNG с обрезкой по содержимому
from PIL import Image
import os

base = os.path.join(os.path.dirname(__file__), '..', 'design', 'icons')
sheet = Image.open(os.path.join(base, 'sheet.png')).convert('RGBA')
W, H = sheet.size
cols, rows = 4, 5
cw, ch = W / cols, H / rows

slugs = ['cart','food','transport','taxi','home','internet','health','clothes',
         'fun','subs','edu','gift','travel','household','kids','pets',
         'auto','salary','transfer','other']

SIZE = 240
for idx, slug in enumerate(slugs):
    r, c = divmod(idx, cols)
    box = (int(c*cw), int(r*ch), int((c+1)*cw), int((r+1)*ch))
    cell = sheet.crop(box)
    # обрезать прозрачные поля
    bbox = cell.getbbox()
    if bbox:
        cell = cell.crop(bbox)
    # вписать в квадрат SIZE с прозрачным фоном
    cell.thumbnail((SIZE-20, SIZE-20), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0,0,0,0))
    canvas.paste(cell, ((SIZE-cell.width)//2, (SIZE-cell.height)//2), cell)
    canvas.save(os.path.join(base, slug + '.png'))
    print('saved', slug)
print('DONE')
