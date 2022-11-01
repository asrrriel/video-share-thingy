import Config from 'doge-config';
import fs from 'fs';
import http from 'http';
import { contentType } from 'mime-types';
import { Database } from 'nscdn-csvdb';
import path from 'path';
import { generateSunflake } from 'sunflake';

export function parseContentRangePair(
	range_str: string,
	content_length: number
): [number, number] {
	const [lesser, greater] = range_str.split('-').map(Number);

	if (lesser && greater) {
		return [Number(lesser), Number(greater)];
	} else if (lesser) {
		return [Number(lesser), content_length - 1];
	} else if (greater) {
		return [content_length - Number(greater) - 1, content_length - 1];
	} else {
		return [0, content_length - 1];
	}
}

export function parseContentRange(
	range_header: string,
	content_length: number
): [number, number] | void {
	const ranges = String(range_header).match(/(\d*\-\d*)/g);

	if (ranges) {
		return [...ranges]
			.map((range) => {
				return parseContentRangePair(range, content_length);
			})
			.shift();
	}
}

export async function main() {
	const config = new Config('config', {}, '..');
	const database = new Database('../database');
	const sunflake = generateSunflake();

	const videos = await database.getTable('videos', {
		id: 'string',
		name: 'string',
		type: 'string',
	});

	const style = `<style> * {
	color-scheme: light dark;
	color: rgba(255, 255, 255, 0.87);
	background-color: #242424;
} </style>
`;

	const server = http.createServer(async (request, response) => {
		const url = new URL(request.url || '/', 'a://b');

		if (url.pathname.startsWith('/videos/')) {
			const [video] = await videos.find({
				id: url.pathname.slice('/videos/'.length),
			});

			const file = video?.id && `../videos/${video.id}`;

			if (file && fs.existsSync(file)) {
				const stats = await fs.promises.stat(file);

				const range = parseContentRange(
					request.headers.range || '',
					stats.size
				);

				if (range) {
					response.statusCode = 206;

					let [start, end] = range;

					if (end >= start + 1024 * 256) {
						end = start + 1024 * 256 - 1;
					}

					response.setHeader('Content-Type', video.type);
					response.setHeader('Accept-Ranges', 'bytes');
					response.setHeader('Access-Control-Allow-Origin', '*');
					response.setHeader('Access-Control-Allow-Methods', 'GET');
					response.setHeader('Access-Control-Allow-Headers', '*');

					response.setHeader(
						'Content-Range',
						`bytes ${start}-${end}/${stats.size}`
					);

					fs.createReadStream(file, {
						start,
						end: end + 1,
					}).pipe(response);

					return;
				} else {
					response.statusCode = 200;

					response.setHeader('Content-Type', video.type);
					response.setHeader('Accept-Ranges', 'bytes');
					response.setHeader('Access-Control-Allow-Origin', '*');
					response.setHeader('Access-Control-Allow-Methods', 'GET');
					response.setHeader('Access-Control-Allow-Headers', '*');
					response.setHeader('Content-Length', stats.size);

					return fs.createReadStream(file).pipe(response);
				}
			} else {
				response.statusCode = 404;

				return response.end();
			}
		} else if (request.method === 'PUT') {
			const id = sunflake();
			const file = `../videos/${id}`;
			const ws = fs.createWriteStream(file);
			request.pipe(ws);

			return request.on('end', async () => {
				await videos.insert({
					id,
					name: String(request.url || '').slice(1),
					type: request.headers['content-type'] || 'text/plain',
				});

				const payload = Buffer.from(
					JSON.stringify({ url: `/videos/${id}` })
				);

				response.statusCode = 200;
				response.setHeader('Content-Type', 'application/json');
				response.setHeader('Content-Length', payload.length);

				response.write(payload);
				response.end();
			});
		}

		if (url.pathname === '/videos.html') {
			response.statusCode = 200;
			response.setHeader('Content-Type', 'text/html; charset=UTF-8');

			const items = (await videos.find({}))
				.map((video) => {
					return `<li><a href="/videos/${
						video.id
					}">${video.name.replace(/[^a-z0-9_\.\-]+/gi, '')}</a></li>`;
				})
				.join('');

			response.write(`${style}<h1>List of Videos</h1><ul>${items}</ul>`);

			return response.end();
		}

		const fspath = path.resolve(
			'../frontend/dist',
			path
				.resolve(url.pathname === '/' ? '/index.html' : url.pathname)
				.slice(1)
		);

		if (fs.existsSync(fspath)) {
			response.statusCode = 200;
			response.setHeader(
				'Content-Type',
				contentType(path.basename(fspath)) || 'text/plain'
			);

			return fs.createReadStream(fspath).pipe(response);
		} else {
			response.statusCode = 302;
			response.setHeader('Location', '..');

			return response.end();
		}
	});

	server.listen((config.num.port ||= 2000));

	await fs.promises.mkdir('../videos', { recursive: true });

	return { server };
}
