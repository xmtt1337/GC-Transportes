"""
Junta todos os CSVs de um arquivo ZIP em um único CSV.
Uso: python juntar_csv.py <arquivo.zip> [saida.csv]
"""
import sys
import csv
import os
import shutil
import zipfile
import argparse
from pathlib import Path


def merge_csvs_from_zip(zip_path: str, output_path: str | None = None) -> str:
    zip_path = Path(zip_path)

    if not zip_path.exists():
        raise FileNotFoundError(f"ZIP não encontrado: {zip_path}")

    if output_path is None:
        output_path = zip_path.with_name(zip_path.stem + "_MERGED.csv")
    output_path = Path(output_path)

    extract_dir = zip_path.parent / "_tmp_merge"

    try:
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(extract_dir)

        csv_files = sorted(extract_dir.glob("*.csv"))
        if not csv_files:
            raise ValueError("Nenhum arquivo CSV encontrado dentro do ZIP.")

        print(f"Encontrados {len(csv_files)} arquivo(s) CSV.")

        header_written = False
        total_rows = 0

        with open(output_path, "w", newline="", encoding="utf-8") as out_f:
            writer = None
            for csv_file in csv_files:
                with open(csv_file, "r", encoding="utf-8") as in_f:
                    reader = csv.reader(in_f)
                    header = next(reader)
                    if not header_written:
                        writer = csv.writer(out_f)
                        writer.writerow(header)
                        header_written = True
                    count = 0
                    for row in reader:
                        writer.writerow(row)
                        count += 1
                    total_rows += count
                    print(f"  {csv_file.name}: {count} linhas")

        print(f"\nTotal: {total_rows} linhas")
        print(f"Salvo em: {output_path}")
        return str(output_path)

    finally:
        if extract_dir.exists():
            shutil.rmtree(extract_dir)


def main():
    parser = argparse.ArgumentParser(description="Junta CSVs de um ZIP em um único arquivo.")
    parser.add_argument("zip", help="Caminho para o arquivo .zip")
    parser.add_argument("saida", nargs="?", help="Caminho do CSV de saída (opcional)")
    args = parser.parse_args()

    merge_csvs_from_zip(args.zip, args.saida)


if __name__ == "__main__":
    main()
