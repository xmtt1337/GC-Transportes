import csv
import os
from pathlib import Path

pasta = Path(__file__).parent
downloads = Path.home() / "Downloads"
saida = downloads / "merged.csv"

arquivos = sorted(pasta.glob("*.csv"))
if not arquivos:
    print("Nenhum arquivo .csv encontrado nesta pasta.")
    exit()

print(f"Encontrados {len(arquivos)} arquivo(s):")

header_escrito = False
total = 0

with open(saida, "w", newline="", encoding="utf-8") as out_f:
    writer = None
    for arquivo in arquivos:
        with open(arquivo, "r", encoding="utf-8") as in_f:
            reader = csv.reader(in_f)
            header = next(reader)
            if not header_escrito:
                writer = csv.writer(out_f)
                writer.writerow(header)
                header_escrito = True
            count = 0
            for row in reader:
                writer.writerow(row)
                count += 1
            total += count
            print(f"  {arquivo.name}: {count} linhas")

print(f"\nTotal: {total} linhas")
print(f"Salvo em: {saida}")
