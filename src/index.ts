import fs from "fs";
import fetch from "node-fetch";
import cp from "child_process";
import m3u8Load from "./m3u8-loader";
import path from "path";
import dateFormat from "./dateFormat";

(async () => {
    if (process.argv.length < 4) {
        process.stderr.write("Not enough paramaters");
        console.log(`Usage
    node index.js [StreamURL] [JSON-URL] [outPath] [TimeInSecoonds] [Performer?] [AlbumTitle?]`);
        process.exit();
    }

    const streamUrl = await m3u8Load(process.argv[2], "mp3");
    const jsonMetadataURL = process.argv[3];
    const outPath = process.argv[4];
    const runTime = parseInt(process.argv[5] || "-1", 10);

    if (!isFinite(runTime)) {
        process.stderr.write("Invalid time");
        console.log("The time the script should be executed for must be positive or 0");
    }

    const now = new Date();
    const scriptStart = now.getTime() / 1000.0;
    const endTime = runTime > 0 ? now.getTime() + runTime * 1000 : -1;
    const outFileNameBase = path.basename(outPath) + dateFormat(now);
    const fullFilePath = path.join(path.dirname(outPath), outFileNameBase);

    const ffmpeg = cp.exec(`ffmpeg -i ${streamUrl} -c copy -t ${runTime} ${fullFilePath}.mp3`);


    let lastTrackNum = 0;
    let wasSaved = false;
    let jsonCueSheet: { [id: string]: { stationId: string, id: string, artist: string, title: string, starttime: number, duration: number, type: string, cover: string, url: object, playingMode: number } } = {};
    let cueSheet = `REM JSONFILE ${jsonMetadataURL}
REM DATE ${new Date().toISOString()}\n`;

    if (process.argv.length > 6) {
        cueSheet += `PERFORMER "${process.argv[6].replace(/"/g, "\\\"")}"\n`;
        cueSheet += `TITLE "${process.argv[7].replace(/"/g, "\\\"")}"\n`;
    }

    cueSheet += `FILE "${outFileNameBase}.mp3" MP3\n`;

    function trackNum(): string {
        lastTrackNum++;
        return lastTrackNum.toString(10).padStart(2, "0");
    }

    function formatTime(time: number): string {
        let rel = time - scriptStart;
        const m = Math.floor(rel / 60.0);
        rel -= m * 60;
        const s = Math.floor(rel);
        return `${m.toString(10).padStart(2, "0")}:${s.toString(10).padStart(2, "0")}:00`;
    }

    function endScript(): void {
        if (!wasSaved) {
            wasSaved = true;
            const idsSorted = Object.keys(jsonCueSheet).sort((a, b) => {
                if (!jsonCueSheet[a].starttime || !jsonCueSheet[a].starttime) {
                    if (jsonCueSheet[a].id < jsonCueSheet[b].id) {
                        return -1;
                    } else if (jsonCueSheet[a].id == jsonCueSheet[b].id) {
                        return 0;
                    } else {
                        return 1;
                    }
                } else {
                    return jsonCueSheet[a].starttime - jsonCueSheet[b].starttime;
                }
            });
            let lastTrackStart = scriptStart;
            for (let i = 0; i < idsSorted.length; i++) {
                const track = jsonCueSheet[idsSorted[i]];
                if (!track.starttime || ((track.starttime >= scriptStart || (track.duration && track.starttime + track.duration >= scriptStart)) && track.starttime <= endTime / 1000)) {
                    cueSheet += `  TRACK ${trackNum()} AUDIO\n`;
                    cueSheet += `    TITLE "${track.title.replace(/"/g, "\\\"")}"\n`;
                    cueSheet += `    PERFORMER "${track.artist.replace(/"/g, "\\\"")}"\n`;
                    if (isFinite(track.starttime)) {
                        if (track.starttime < scriptStart && track.duration && track.starttime + track.duration >= scriptStart) {
                            cueSheet += `    INDEX 01 ${formatTime(scriptStart)}\n`;
                            lastTrackStart = scriptStart;
                        } else {
                            cueSheet += `    INDEX 01 ${formatTime(track.starttime)}\n`;
                            lastTrackStart = track.starttime;
                        }
                    } else {
                        cueSheet += `    INDEX 01 ${formatTime(lastTrackStart)}\n`;
                    }
                    if (isFinite(track.duration)) {
                        cueSheet += `    REM LENGTH ${track.duration}\n`;
                    }
                }
            }
            fs.writeFileSync(fullFilePath + ".cue", cueSheet);
            fs.writeFileSync(fullFilePath + ".json", JSON.stringify(jsonCueSheet, null, "    "));
            if (ffmpeg.exitCode === null) {
                ffmpeg.kill("SIGINT");
            }
        }
    }

    function downloadJson(): void {
        if (!wasSaved) {
            fetch(jsonMetadataURL)
                .then(res => res.json())
                .then(body => {
                    if (!wasSaved) {
                        console.log(body);
                        if (!body || !body.length) {
                            throw new Error("Invalid response");
                        }
                        for (const track of body) {
                            if (!jsonCueSheet[track.id]) {
                                jsonCueSheet[track.id] = track;
                            }
                        }
                    }
                })
                .catch(err => {
                    process.stderr.write("Couldn't load JSON!");
                    console.error(err);
                });
            if (Date.now() > endTime && endTime > 0) {
                endScript();
            } else {
                setTimeout(downloadJson, 5000);
            }
        }
    }

    process.on('exit', endScript.bind(null, { cleanup: true }));

    //catches ctrl+c event
    process.on('SIGINT', endScript.bind(null, { exit: true }));

    // catches "kill pid" (for example: nodemon restart)
    process.on('SIGUSR1', endScript.bind(null, { exit: true }));
    process.on('SIGUSR2', endScript.bind(null, { exit: true }));

    //catches uncaught exceptions
    process.on('uncaughtException', endScript.bind(null, { exit: true }));

    downloadJson();

})();