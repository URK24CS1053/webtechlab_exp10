const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const PORT = 3000;
const MONGO_URL = 'mongodb://127.0.0.1:27017';

const client = new MongoClient(MONGO_URL);

const dbName = 'registrationDB';
let registrations;

const publicDir = __dirname;

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function sendHTML(res, status, html) {
    res.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8'
    });
    res.end(html);
}

function serveFile(res, filename, contentType) {
    fs.readFile(path.join(publicDir, filename), (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end('File not found');
        }

        res.writeHead(200, {
            'Content-Type': contentType
        });
        res.end(data);
    });
}

function page(title, content) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHTML(title)}</title>
        <link rel="stylesheet" href="/style.css">
    </head>
    <body>
        <div class="container">
            ${content}
        </div>
    </body>
    </html>`;
}

const server = http.createServer(async (req, res) => {
    try {
        if (req.method === 'GET' && req.url === '/') {
            return serveFile(res, 'home.html', 'text/html; charset=utf-8');
        }

        if (req.method === 'GET' && req.url === '/style.css') {
            return serveFile(res, 'style.css', 'text/css; charset=utf-8');
        }

        if (req.method === 'POST' && req.url === '/server') {
            let rawData = '';

            for await (const chunk of req) {
                rawData += chunk;

                if (rawData.length > 10000) {
                    return sendHTML(res, 413, 'Form data is too large.');
                }
            }

            const formData = new URLSearchParams(rawData);

            const name = (formData.get('name') || '').trim();
            const password = formData.get('password') || '';
            const ageText = formData.get('age') || '';
            const mobile = formData.get('mobile') || '';
            const email = (formData.get('email') || '').trim();
            const gender = formData.get('gender') || '';
            const state = formData.get('state') || '';
            const skills = formData.getAll('skills');

            const age = Number(ageText);

            if (
                !name || !password || !ageText ||
                !mobile || !email || !gender || !state ||
                skills.length === 0 ||
                !Number.isInteger(age) || age < 1 || age > 120 ||
                !/^[0-9]{10}$/.test(mobile) ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
                !['Male', 'Female'].includes(gender) ||
                !['Kerala', 'Tamil Nadu', 'Karnataka',
                  'Maharashtra', 'Andhra Pradesh',
                  'Telangana'].includes(state) ||
                skills.some(skill =>
                    !['Java Script', 'Python', 'C++', 'Java'].includes(skill)
                ) ||
                new Set(skills).size !== skills.length
            ) {
                return sendHTML(
                    res,
                    400,
                    page('Invalid Form', `
                        <h1>Invalid Form Data</h1>
                        <p>Please check your entries and try again.</p>
                        <a href="/">Go Back</a>
                    `)
                );
            }

            // Hash the password before storing it.
            const salt = crypto.randomBytes(16).toString('hex');

            const passwordHash = crypto.scryptSync(
                password,
                salt,
                64
            ).toString('hex');

            const registration = {
                name,
                passwordHash,
                passwordSalt: salt,
                age,
                mobile,
                email,
                gender,
                state,
                skills,
                createdAt: new Date()
            };

            const result = await registrations.insertOne(registration);

            const savedRecord = await registrations.findOne({
                _id: result.insertedId
            });

            const rows = [
                ['Name', savedRecord.name],
                ['Password', '********'],
                ['Age', savedRecord.age],
                ['Mobile Number', savedRecord.mobile],
                ['Email', savedRecord.email],
                ['Gender', savedRecord.gender],
                ['State', savedRecord.state],
                ['Skills', savedRecord.skills.join(', ')]
            ];

            const tableRows = rows.map(([field, value]) => `
                <tr>
                    <th>${escapeHTML(field)}</th>
                    <td>${escapeHTML(value)}</td>
                </tr>
            `).join('');

            return sendHTML(res, 200, page(
                'Submitted Details',
                `
                    <h1>User Submitted Details</h1>
                    <p>Registration saved successfully in MongoDB.</p>
                    <table>
                        <tbody>${tableRows}</tbody>
                    </table>
                    <p><a href="/">Register Another User</a></p>
                `
            ));
        }

        return sendHTML(
            res,
            404,
            page('Not Found', '<h1>404 - Page Not Found</h1><a href="/">Home</a>')
        );

    } catch (error) {
        console.error(error);

        if (!res.headersSent) {
            sendHTML(
                res,
                500,
                page(
                    'Server Error',
                    '<h1>Something went wrong</h1><p>Check the server terminal for details.</p>'
                )
            );
        } else {
            res.end();
        }
    }
});

async function startServer() {
    try {
        await client.connect();

        const db = client.db(dbName);
        registrations = db.collection('registrations');

        server.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log(`Database: ${dbName}`);
            console.log('Collection: registrations');
        });
    } catch (error) {
        console.error('Could not connect to MongoDB:', error);
        process.exitCode = 1;
    }
}

startServer();