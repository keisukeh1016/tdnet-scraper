import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import { stringify } from "csv-stringify/sync";
import * as dotenv from "dotenv";
import * as fs from "node:fs/promises";
import * as path from "node:path";

type FormattedDate = {
  year: string;
  month: string;
  day: string;
};

type TDnetDisclosure = {
  time: string;
  code: string;
  name: string;
  title: string;
  place: string;
};

main();

async function main() {
  // 初期処理
  dotenv.config();

  // コマンドライン引数から日付を取得
  const dateString = process.argv[2];
  const date = getDate(dateString);
  const formattedDate = getFormattedDate(date);

  // TDnet開示情報を取得
  const disclosures = await scrapeTDnet(formattedDate);

  // TDnet開示情報の出力先を取得
  const dir = await getDirectoryName();
  const file = getFilename(dir, formattedDate);

  // TDnet開示情報を出力
  await outputCSV(file, disclosures);
}

// 日付関連処理
function getDate(dateString: string): Date {
  const date = new Date(dateString);

  if (Number.isNaN(date.valueOf())) {
    throw new Error(
      "Invalid date format. Please enter a date in yyyy-MM-dd format."
    );
  }
  return date;
}

function getFormattedDate(date: Date): FormattedDate {
  const formattedDate: FormattedDate = {
    year: date.getFullYear().toString().padStart(4, "0"),
    month: (date.getMonth() + 1).toString().padStart(2, "0"),
    day: date.getDate().toString().padStart(2, "0"),
  };

  return formattedDate;
}

// ファイル関連処理
async function getDirectoryName(): Promise<string> {
  const dir = process.env["CSV_DIRECTORY"] ?? "";
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function getFilename(dir: string, date: FormattedDate): string {
  const filename = path.join(dir, `${date.year}-${date.month}-${date.day}.csv`);
  return filename;
}

async function outputCSV(
  file: string,
  disclosures: TDnetDisclosure[]
): Promise<void> {
  if (disclosures.length === 0) {
    return;
  }

  const output = stringify(disclosures, { header: true });
  await fs.writeFile(file, output);
}

// HTTP関連処理
async function scrapeTDnet(date: FormattedDate): Promise<TDnetDisclosure[]> {
  let disclosures: TDnetDisclosure[] = [];

  for (let i = 0; i < 100; i++) {
    const page = (i + 1).toString().padStart(3, "0");
    const url = `https://www.release.tdnet.info/inbs/I_list_${page}_${date.year}${date.month}${date.day}.html`;

    const response = await getResponse(url);
    if (response === null) {
      break;
    }

    const pageDisclosures = parseResponse(response);
    if (pageDisclosures.length === 0) {
      break;
    }

    disclosures = disclosures.concat(pageDisclosures);
  }
  return disclosures;
}

async function getResponse(
  url: string
): Promise<AxiosResponse<any, any> | null> {
  let response: AxiosResponse<any, any> | null = null;

  try {
    response = await axios.get(url);
  } catch (error) {
    if (error instanceof axios.AxiosError) {
      if (error.response?.status === 404) {
        // 404
      } else {
        throw new Error(`Failed to get data: ${error.message}`);
      }
    } else {
      throw error;
    }
  }

  return response;
}

function parseResponse(response: AxiosResponse<any, any>): TDnetDisclosure[] {
  let disclosures: TDnetDisclosure[] = [];

  try {
    const $ = cheerio.load(response.data);
    disclosures = $("table#main-list-table > tbody > tr")
      .toArray()
      .map((el): TDnetDisclosure => {
        return {
          time: $(el).find("td.kjTime").text().trim(),
          code: $(el).find("td.kjCode").text().trim().substring(0, 4),
          name: $(el).find("td.kjName").text().trim(),
          title: $(el).find("td.kjTitle > a").text().trim(),
          place: $(el).find("td.kjPlace").text().trim(),
        };
      });
  } catch (error) {
    disclosures = [];
  }
  return disclosures;
}
