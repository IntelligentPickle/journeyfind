import axios from "axios";
import fs from "fs";
import jimp from 'jimp'
import path from "path";
// Configuration
let pollingRate = 1000 // DO NOT CHANGE THIS! This is meant to be changed to the time remaining before the next song is played.
let apiKey = "kglk" // LDRHub API Key. Usually the station's callsign.
let artistList = {}

// Make UI
import blessed from 'blessed'
import contrib from 'blessed-contrib'

let screen = blessed.screen()
let grid = new contrib.grid({ rows: 2, cols: 2, screen: screen })

var log = grid.set(0, 0, 1, 1, contrib.log,
    {
        style:
        {
            text: "green"
            , baseline: "black"
        }
        , xLabelPadding: 3
        , xPadding: 5
        , label: 'Log'
    })

var tree = grid.set(0, 1, 1, 1, contrib.tree, { fg: 'green', label: 'Song List' })

var coverart = grid.set(1, 0, 1, 1, contrib.picture, {
    file: './assets/missing_cover.png',
    cols: 54,
    
})

var songlog = grid.set(1, 1, 1, 1, contrib.log,
    {
        style:
        {
            text: "green"
            , baseline: "black"
        }
        , xLabelPadding: 3
        , xPadding: 5
        , label: 'Song History'
    })

//allow control the table with the keyboard
tree.focus()

// Define keyboard controls
screen.key(['escape', 'q', 'C-c'], function (ch, key) {
    // Clear the cache folder (holds the cover art images)
    fs.readdir('./cache/', (err, files) => {
      
        for (const file of files) {
          fs.unlink(path.join('./cache/', file), err => {
            if (err) throw err;
          });
        }
    });
    return process.exit(0)
});

screen.title = 'JourneyJourney - q to quit'
screen.render()

log.log('\x1b[36m=== JourneyFind ===')
log.log(`\x1b[36m=== Started at \x1b[1m${new Date().toISOString()}\x1b[0m\x1b[36m ===`)
log.log(`\x1b[36m=== Station: \x1b[1m${apiKey}\x1b[0m\x1b[36m ===`);
songlog.log(`\x1b[36m=== Beginning of History ===`)

// Functions
function updateTree() {
    tree.setData(
        {
            extended: true,
            children: {
                [apiKey]: {
                    extended: true,
                    children: artistList
                    // === Format ===
                    // 'JOURNEY': {
                    //     children: {
                    //         'Seperate Ways': { name: 'Seperate Ways' }
                    //     }
                    // }
                }
            }
        }
    )
}

async function setCoverArt(artUrl, id) {
    // The cover art URLs that LDRHub provides are in JPG, which blessed doesn't seem to like.
    // We need to convert them to PNG before we can display them.
    // The following code will:
    //  - Download the cover art from LDRHub (500x500 atm)
    //  - Converts the downloaded image data to PNG
    //  - Recreates the cover art box with the new cover art file
    await jimp.read(artUrl)
        .then(cover => {
            cover.write(`./cache/${id}.png`, (err, data) => {
                coverart = grid.set(1, 0, 1, 1, contrib.picture, {
                    file: `./cache/${id}.png`,
                    cols: 54
                })
                screen.render(); // Rerender the screen, because it doesn't rerender itself.
            }); // save
        })
}

function loop() {
    setTimeout(async () => {
        log.log('\x1b[90mFetching current song...')
        await axios.get(`https://api.ldrhub.com/2/?key=${apiKey}&method=Station.Engage.NowPlaying`)
            .then(async (r) => {
                // Not needed but makes this all cleaner
                let now_playing = r.data["Station.Engage.NowPlaying"].now_playing
                // Check if now_playing is null (an ad may be playing, or the station is processing new player data)
                if (now_playing === null) {
                    log.log('\x1b[33mAn ad is playing, or the station is still processing. Waiting 15 seconds...')
                    // Wait 10 more seconds before retrying
                    pollingRate = 15000
                    return loop()
                }
                // Create a skeleton object for the artist in case it does not exist yet
                if (!artistList[now_playing.artist]) {
                    artistList[now_playing.artist] = {
                        children: {}
                    }
                }
                Object.assign(artistList[now_playing.artist].children, {
                    [now_playing.system_timestamp]: { name: now_playing.title }
                })
                updateTree();

                // Add song to the history log
                var songPlayedTimestamp = new Date(now_playing.system_timestamp * 1000).toLocaleString();
                songlog.log(`\x1b[32m[\x1b[1m${songPlayedTimestamp}\x1b[0m\x1b[32m] - ${now_playing.title} - ${now_playing.artist}`)
                setCoverArt(now_playing.album_art, now_playing.id);
                // Wait for the song to finish playing, and then scan again when the next one starts.
                log.log(`\x1b[35mWaiting ${now_playing.seconds_left * 1000} ms for the song to finish playing.`)
                pollingRate = now_playing.seconds_left * 1000
                loop()
            })
            .catch((e) => {
                log.log(`\x1b[31mFailed to get the current playing song:`)
                log.log(`\x1b[31m${e}`)
                log.log(`\x1b[31mWaiting 30 seconds before trying again.`)
                pollingRate = 30000
                loop()
            })
    }, pollingRate)
}

loop()