import axios from "axios";
import fs from "fs";
import jimp from 'jimp'
import path from "path";
import blessed from 'blessed'
import contrib from 'blessed-contrib'
import chalk from 'chalk'
import { join, dirname } from 'path'
import { Low, JSONFile } from 'lowdb'
import { fileURLToPath } from 'url'

// Configuration
let treeStoreVer = 1 // If a read tree store file does not have a version matching this, raise a warning.
let pollingRate = 1000 // DO NOT CHANGE THIS! This is meant to be changed to the time remaining before the next song is played.
let extraPollingDelay = 8000 // Extra time to add onto the timer for pulling the next song. Hacky solution to prevent songs from duping in the tree.
let apiKey = "kglk" // LDRHub API Key. Usually the station's callsign.
let artistList = {}

// Functions
function updateTree() {
    console.log(artistList)
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
            cover.write(`./cache/${id}.png`, () => {
                return coverart.setImage({
                    file: `./cache/${id}.png`,
                    cols: 54,
                    onReady: function () {
                        screen.render()
                    }
                })
            }); // save
        })
}

function loop() {
    setTimeout(async () => {
        log.log(chalk.gray('Fetching current song...'))
        await axios.get(`https://api.ldrhub.com/2/?key=${apiKey}&method=Station.Engage.NowPlaying`)
            .then(async (r) => {
                // Not needed but makes this all cleaner
                let now_playing = r.data["Station.Engage.NowPlaying"].now_playing
                // Check if now_playing is null (an ad may be playing, or the station is processing new player data)
                if (now_playing === null) {
                    log.log(chalk.yellowBright('An ad is playing, or the station is still processing. Waiting 15 seconds...'))
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
                songlog.log(chalk.green(`[${chalk.greenBright(songPlayedTimestamp)}] - ${now_playing.title} - ${now_playing.artist}`))
                setCoverArt(now_playing.album_art, now_playing.id);
                // Wait for the song to finish playing, and then scan again when the next one starts.
                log.log(chalk.magentaBright(`Waiting ${now_playing.seconds_left * 1000} (+ ${extraPollingDelay}) ms for the song to finish playing.`))
                pollingRate = (now_playing.seconds_left * 1000) + extraPollingDelay
                loop()
            })
            .catch((e) => {
                log.log(chalk.redBright(`Failed to get the current playing song:`))
                log.log(chalk.redBright(`${e}`))
                log.log(chalk.redBright(`Waiting 30 seconds before trying again.`))
                pollingRate = 30000
                loop()
            })
    }, pollingRate)
}

// Create the screen, and the grid for it
let screen = blessed.screen()
let grid = new contrib.grid({ rows: 2, cols: 2, screen: screen })

// Build the elements for the UI:
//  - The log, for displaying status messages.
//  - The tree, for displaying the artist list.
//  - The cover art box (picture), for displaying the cover art in ASCII.
//  - The song log, for displaying the song history.
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
    onReady: function () {
        screen.render()
    }
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

// Make the tree interactive.
tree.focus()

// Define interactive keyboard controls.

// Keyboard control for showing help information.
screen.key(['h'], async function (ch, key) {
    log.log('')
    log.log(chalk.cyan('=== q - exit ==='))
    log.log(chalk.cyan('=== c - clear logs ==='));
    log.log(chalk.cyan('=== shift+c - clear tree ==='));
    log.log(chalk.cyan('=== h - show this menu ==='));
});

// Keyboard control for quitting.
screen.key(['q'], async function (ch, key) {
    // Clear the cache folder (holds the cover art images)
    fs.readdir('./cache/', (err, files) => {
        console.log(files)
        if (files.length === 0) {
            screen.destroy()
            console.log(chalk.cyan('The cache was not wiped, as it was already empty.'))
            return process.exit(0)
        } else {
            log.log(chalk.gray('Wiping the cache folder...'))
            for (const file of files) {
                fs.unlink(path.join('./cache/', file), err => {
                    screen.destroy()
                    return process.exit(0)
                });
            }
        }
    });
});

// Keyboard control for clearing the logs.
screen.key(['c'], async function (ch, key) {
    // Recreate log and songlog objects
    log = grid.set(0, 0, 1, 1, contrib.log,
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
    songlog = grid.set(1, 1, 1, 1, contrib.log,
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
    return screen.render();
});

// Keyboard control for clearing the tree.
screen.key(['S-c'], async function (ch, key) {
    artistList = {}
    updateTree();
    return screen.render();
});

// Set the window title, and render!
screen.title = 'JourneyJourney'
screen.render()

// Print a few startup messages to the LOG box.
log.log(chalk.cyan('=== JourneyJourney - Press h for help ==='))

// Initialize the database
const __dirname = dirname(fileURLToPath(import.meta.url));
// Use JSON file for storage
const file = join(__dirname, 'treestore.json')
const adapter = new JSONFile(file)
const db = new Low(adapter)
// Read existing data
await db.read()

// If the database file doesn't exist, set the data to be a default empty object
db.data ||= {
    "version": treeStoreVer,
    "tree": {}
}; await db.write()

// Check version of tree store.
if (db.data.version !== treeStoreVer) {
    log.log(chalk.yellowBright(`The existing tree store file is of version ${db.data.version}, but we use ${treeStoreVer}.`))
    log.log(chalk.yellowBright(`To protect the integrity of the tree store file, it will NOT be loaded.`))
} else if (db.data.tree) {
    // artistList = db.data.tree;
    // updateTree()
}

// Start the loop.
loop()