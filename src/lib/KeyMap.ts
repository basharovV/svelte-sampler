import * as Tone from 'tone';

const semitones = {
	1: 'C',
	2: 'C#',
	3: 'D',
	4: 'D#',
	5: 'E',
	6: 'F',
	7: 'F#',
	8: 'G',
	9: 'G#',
	10: 'A',
	11: 'A#',
	12: 'B'
};

const whiteKeysWidth = 24;
const blackKeysWidth = 16;
const blackKeysOffset = whiteKeysWidth / 2 + (whiteKeysWidth - blackKeysWidth) / 2;

function generateKeys(firstNote: string, lastNote: string) {
	/**
	 * A keymap of notes, each with the musical notation, MIDI value, black/white note, and x position for the UI
	 */
	const keys: Array<{ key: string; midi: number; isBlack: boolean; x: number }> = [];

	let whiteKeyNum = 0;
	let currentIndex = 0;

	function getSemitoneIndex(noteName) {
		return Object.entries(semitones).findIndex((n) => n[1] === noteName) + 1;
	}

	function getOctave(note: string) {
		return parseInt(note.charAt(1));
	}

	for (let oct = getOctave(firstNote); oct <= getOctave(lastNote); oct++) {
		const isLowestOctave = oct === getOctave(firstNote);
		const isHighestOctave = oct === getOctave(lastNote);
		const startingNote = isLowestOctave ? getSemitoneIndex(firstNote.charAt(0)) : 1;
		const endNote = isHighestOctave ? getSemitoneIndex(lastNote.charAt(0)) : 12;

		for (let note = startingNote; note <= endNote; note++) {
			const key = semitones[note] + oct;
			const isBlack = semitones[note].includes('#');
			keys.push({
				key,
				midi: Tone.Frequency(semitones[note] + oct).toMidi(),
				x: isBlack ? keys[currentIndex - 1].x + blackKeysOffset : whiteKeyNum * whiteKeysWidth,
				isBlack
			});

			// Black key pos is based on previous white key position
			currentIndex++;
			!isBlack && whiteKeyNum++;
		}
	}
	return keys;
}

export { generateKeys };
