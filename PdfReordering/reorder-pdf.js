const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const env = require('dotenv');
env.config(); // Load environment variables from .env file if it exists
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));


// --- Multer Configuration for File Uploads ---
// We'll store the uploaded file in the 'uploads/' directory.
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Use a timestamp to make the filename unique
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
            return cb(new Error('Only PDF files are allowed!'), false);
        }
        cb(null, true);
    }
});


// --- PDF Processing Logic ---
/**
 * Splits a PDF into odd and even page files.
 * @param {string} inputPath - The file path of the source PDF.
 * @returns {Promise<object>} An object with paths to the odd and even PDFs.
 */
async function splitPdfByPageParity(inputPath) {
    try {
        const timestamp = Date.now();
        const originalFilename = path.basename(inputPath).replace('.pdf', '');
        
        const oddOutputPath = path.join(__dirname, 'public', `${timestamp}-odd-pages.pdf`);
        const evenOutputPath = path.join(__dirname, 'public', `${timestamp}-even-pages.pdf`);

        const existingPdfBytes = await fs.readFile(inputPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pageCount = pdfDoc.getPageCount();

        const oddPdfDoc = await PDFDocument.create();
        const evenPdfDoc = await PDFDocument.create();

        const evenPageIndices = [];
        const oddPageIndices = [];

        for (let i = 0; i < pageCount; i++) {
            if ((i + 1) % 2 === 0) {
                evenPageIndices.push(i);
            } else {
                oddPageIndices.push(i);
            }
        }

        if (oddPageIndices.length > 0) {
            const oddPages = await oddPdfDoc.copyPages(pdfDoc, oddPageIndices);
            for (const page of oddPages) {
                oddPdfDoc.addPage(page);
            }
            const oddPdfBytes = await oddPdfDoc.save();
            await fs.writeFile(oddOutputPath, oddPdfBytes);
        }

        if (evenPageIndices.length > 0) {
            const evenPages = await evenPdfDoc.copyPages(pdfDoc, evenPageIndices);
            for (const page of evenPages) {
                evenPdfDoc.addPage(page);
            }
            const evenPdfBytes = await evenPdfDoc.save();
            await fs.writeFile(evenOutputPath, evenPdfBytes);
        }

        // Clean up the uploaded file
        await fs.unlink(inputPath);

        return {
            oddFile: oddPageIndices.length > 0 ? path.basename(oddOutputPath) : null,
            evenFile: evenPageIndices.length > 0 ? path.basename(evenOutputPath) : null,
        };

    } catch (error) {
        console.error('Error during PDF splitting:', error);
        // Clean up in case of error
        await fs.unlink(inputPath).catch(err => console.error("Failed to cleanup file:", err));
        throw error;
    }
}


// --- Express Routes ---

// GET Route: Display the upload form
app.get('/', (req, res) => {
    res.render('index');
});

// POST Route: Handle the file upload and splitting process
app.post('/split-pdf', upload.single('pdfFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    try {
        const { oddFile, evenFile } = await splitPdfByPageParity(req.file.path);
        res.render('download', { oddFile, evenFile });
    } catch (error) {
        res.status(500).send('An error occurred while processing the PDF.');
    }
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
    // Ensure directories exist
    ['uploads', 'public'].forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        fs.mkdir(dirPath, { recursive: true }).catch(console.error);
    });
});
