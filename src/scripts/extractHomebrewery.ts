import fs, { PathLike } from 'fs';
import path from 'path';
import postcss from 'postcss';
import url from 'postcss-url';
import AdmZip from "adm-zip";
import { fileURLToPath } from 'url';

//TODO: IMPORTANT: Automate the PackHomebrew script.

const HOMEBREWERY_REPO_ZIP_URL =
    "https://github.com/naturalcrit/homebrewery/archive/refs/heads/master.zip";

type CopyEntry =
    | string
    | { from: string; to: string };

const HOMEBREWERY_FILES_AND_FOLDER = [
    { from: "/build/themes/V3/", to: "/build/themes/homebrewery/" },
    // "/build/themes/Legacy/",
    "/build/assets/",
    "/build/fonts/",
    "/shared/markdown.js",
    { from: "/build/homebrew/bundle.css", to: "/build/themes/homebrewery/bundle.css" }
];

const TMP_DIR = path.resolve(".tmp");
const ZIP_PATH = path.join(TMP_DIR, "master.zip");
const EXTRACT_DIR = path.join(TMP_DIR, "homebrewery");
const WORK_DIR = path.join(TMP_DIR, "work");
const OUTPUT_DIR = path.join(TMP_DIR, "output");

const SOURCE_CSS_FOLDER = path.join(WORK_DIR, '/build/themes/');

const WORKSPACE_ROOT = path.resolve(process.cwd());
const TARGET_CSS_FOLDER = path.join(WORKSPACE_ROOT, '/media/themes/');
const FONTS_FILES_DIR = path.join(WORK_DIR, '/build/fonts');
const ASSETS_FILES_DIR = path.join(WORK_DIR, '/build/assets');

async function downloadRepositoryZip(repositoryUrl: string, targetZipPath: string) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const response = await fetch(repositoryUrl);
    if (!response.ok) {
        console.log(`Failed to download repo: ${response.statusText}`);
        throw new Error(`Failed to download repo: ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(targetZipPath, buffer);
}

function extractRepositoryZip(zipPath: string, extractDir: string) {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
}

function findRepositoryRoot(): string {
    // GitHub zips extract to repo-branch/
    const entries = fs.readdirSync(EXTRACT_DIR);
    if (!entries.length) {
        throw new Error("Extraction failed: no files found.");
    }
    return path.join(EXTRACT_DIR, entries[0]);
}

function copyFilesAndFolders(repoRoot: string, fileList: CopyEntry[], workDir: string) {
    for (const entry of fileList) {
        let relativeSource: string;
        let relativeTarget: string;

        if (typeof entry === "string") {
            relativeSource = entry;
            relativeTarget = entry;
        } else {
            relativeSource = entry.from;
            relativeTarget = entry.to;
        }
        // Remove leading slash so path.join works properly
        relativeSource = relativeSource.replace(/^\/+/, "");
        relativeTarget = relativeTarget.replace(/^\/+/, "");

        const sourcePath = path.join(repoRoot, relativeSource);
        const targetPath = path.join(workDir, relativeTarget);

        if (!fs.existsSync(sourcePath)) {
            console.log(`.. ⚠️ Source not found: ${sourcePath}`);
            continue;
        }

        const stats = fs.statSync(sourcePath);

        // Ensure parent target directory exists
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        if (stats.isDirectory()) {
            fs.cpSync(sourcePath, targetPath, {
                recursive: true,
                force: true
            });
            console.log(`📁 Copied folder → ${relativeTarget}`);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`📄 Copied file → ${relativeTarget}`);
        }
    }
}

function cleanUp() {
    console.log("Cleaning temp folder...");
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

function inlineCssFile(sourceCssFilePath: string, targetCssFilePath: string) {
    console.log(`Inlining: ${sourceCssFilePath} to ${targetCssFilePath}`);

    fs.mkdirSync(path.dirname(targetCssFilePath), { recursive: true });

    let css = fs.readFileSync(sourceCssFilePath, { encoding: 'utf8' });

    // Normalize font URIs in the CSS content before inlining
    css = normalizeFontsUris(css);

    let options = [
        { url: 'inline', encodeType: 'base64', maxSize: Infinity },
        { url: 'inline', basePath: path.resolve(WORK_DIR, "build"), encodeType: 'base64', maxSize: Infinity }
    ];
    postcss()
        .use(url(options))
        .process(css, {
            from: sourceCssFilePath
        }).then(result => {
            fs.writeFileSync(targetCssFilePath, result.css);
            if (result.css === css) {
                console.log(`.. ⚠️ No Inlining - ${sourceCssFilePath}`);
            } else {
                console.log(`→ Inlined: ${targetCssFilePath}`);
            }
        });
}

function inlineCssFilesInDir(cssFilesDir: string, sourceRootFolder: string, targetRootFolder: string) {
    const entries = fs.readdirSync(cssFilesDir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(cssFilesDir, entry.name);

        if (entry.isDirectory()) {
            inlineCssFilesInDir(fullPath, sourceRootFolder, targetRootFolder);
            continue;
        }

        if (entry.isFile() && (entry.name === 'style.css' || entry.name === 'bundle.css')) {
            let relativePath = path.relative(sourceRootFolder, fullPath);
            let targetCssFilePath = path.join(targetRootFolder, relativePath);
            console.log(`Will inline ${fullPath} to ${targetCssFilePath}.`);
            inlineCssFile(fullPath, targetCssFilePath);
        }
    }
}

async function normalizeFontFilesInDir(dir: string) {
    // Recursively walk through the directory and rename font files with spaces in their names
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await normalizeFontFilesInDir(fullPath);
            continue;
        }
        if (
            entry.isFile() &&
            (entry.name.endsWith('.woff') || entry.name.endsWith('.woff2'))
        ) {
            if (entry.name.includes(' ')) {
                const newName = entry.name.replace(/\s+/g, '-');
                const newPath = path.join(dir, newName);
                // console.log(`Renaming: ${fullPath} to ${newPath}`);
                fs.renameSync(fullPath, newPath);
            }
        }
    }

}

function normalizeFontsUris(css: string): string {
    // This function replaces spaces in font file names with dashes in the CSS content.
    return css.replace(
        /url\(([^)]+\.woff2?[^)]*)\)/gi,
        (match, urlPart) => {
            // Remove surrounding quotes if present
            const trimmed = urlPart.trim().replace(/^['"]|['"]$/g, '');

            // Split path and filename
            const lastSlash = trimmed.lastIndexOf('/');
            const dir = lastSlash >= 0 ? trimmed.slice(0, lastSlash + 1) : '';
            const filename = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;

            // Replace spaces in filename only
            const normalizedFilename = filename.replace(/\s+/g, '-');

            const newUrl = dir + normalizedFilename;

            return `url("${newUrl}")`;
        }
    );
}

// Main build function

const isDownload = !!process.argv.find((arg) => arg === '--download');
const isPackAssets = !!process.argv.find((arg) => arg === '--pack');

async function build() {
    if (isDownload) {
        console.log('Cleaning up temporary folder.');
        cleanUp();
        console.log(`Downloading repository zip ${HOMEBREWERY_REPO_ZIP_URL}...`);
        await downloadRepositoryZip(HOMEBREWERY_REPO_ZIP_URL, ZIP_PATH);
        console.log(`Repository Downloaded in ${ZIP_PATH}.`);
        console.log(`Extracting zip${ZIP_PATH} to ${EXTRACT_DIR}...`);
        extractRepositoryZip(ZIP_PATH, EXTRACT_DIR);
    };
    if (isPackAssets) {
        let repositoryRoot = findRepositoryRoot();
        console.log(`Copying Files to ${WORK_DIR}...`);
        copyFilesAndFolders(repositoryRoot, HOMEBREWERY_FILES_AND_FOLDER, WORK_DIR);
        console.log('Normalizing Font File Names...');
        normalizeFontFilesInDir(FONTS_FILES_DIR);
        console.log('Inlining URLs in CSS Files...');
        inlineCssFilesInDir(SOURCE_CSS_FOLDER, SOURCE_CSS_FOLDER, TARGET_CSS_FOLDER);
        console.log('Theme build complete.');
        // TODO: Add copy for markdown.js and icon fonts.
        // cleanUp();
    }
}


build().catch(err => {
    console.error(err);
    process.exit(1);
});