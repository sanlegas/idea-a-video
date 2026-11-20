const UNITS: Record<string, number> = {
	un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
	once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
	veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
	veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
	ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
	cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
	setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};

// Every number written out in a text, plus those already in digits: the only numbers a chip may show.
export const spanishNumbers = (text: string): number[] => {
	const found = (text.match(/\d+/g) ?? []).map(Number);
	const words = text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9 ]+/g, ' ')
		.split(/\s+/);
	let current: number | null = null;
	let total = 0;
	const flush = () => {
		if (current !== null) found.push(total + current);
		current = null;
		total = 0;
	};
	words.forEach((word, i) => {
		if (word === 'mil') {
			total = (current ?? 1) * 1000;
			current = 0;
		} else if (word in UNITS) {
			current = (current ?? 0) + UNITS[word];
		} else if (word === 'y' && current !== null && words[i + 1] in UNITS) {
			return;
		} else {
			flush();
		}
	});
	flush();
	return found;
};
