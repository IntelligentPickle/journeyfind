import axios from "axios";

// Configuration
let pollingRate = 1000 // DO NOT CHANGE THIS! This is meant to be changed to the time remaining before the next song is played.
let artistName = "JOURNEY" // The artist to detect.
let apiKey = "kglk" // LDRHub API Key. Usually the station's callsign.
let matches = 0
// Make UI
import blessed from 'blessed'
import contrib from 'blessed-contrib'
let screen = blessed.screen()
let grid = new contrib.grid({rows: 1, cols: 2, screen: screen})

var log = grid.set(0, 0, 1, 1, contrib.log,
    { style:
      { text: "green"
      , baseline: "black"}
    , xLabelPadding: 3
    , xPadding: 5
    , label: 'Log'})

var table = grid.set(0, 1, 1, 1, contrib.table, { keys: true
    , fg: 'white'
    , selectedFg: 'white'
    , selectedBg: 'blue'
    , interactive: true
    , label: 'Statistics'
    , width: '30%'
    , height: '30%'
    , border: {type: "line", fg: "cyan"}
    , columnSpacing: 10 //in chars
    , columnWidth: [16, 12, 12] /*in chars*/ })

contrib.gauge()
//allow control the table with the keyboard
table.focus()

table.setData(
{ headers: ['Artist', 'Matches']
, data:
    [ [artistName, matches]]})

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    log.log(`Saving results.`)
    return process.exit(0)
});


screen.render()

log.log('\x1b[36m=== JourneyFind ===')
log.log(`\x1b[36m=== Started at \x1b[1m${new Date().toISOString()}\x1b[0m ===`)
log.log(`\x1b[36mArtist Target: \x1b[1m${artistName}`);
log.log(`\x1b[36mStation: \x1b[1m${apiKey}`);

// Function for looping
function loop() {
    setTimeout(async () => {
        log.log('Fetching artist...')
        await axios.get(`https://api.ldrhub.com/2/?key=${apiKey}&method=Station.Engage.NowPlaying`)
        .then((r) => {
            // Check if now_playing is null (an ad may be playing, or the station is processing new player data)
            if (r.data["Station.Engage.NowPlaying"].now_playing === null) {
                log.log('\x1b[33mAn ad is playing, or the station is still processing. Waiting 15 seconds...')
                // Wait 10 more seconds before retrying
                pollingRate = 15000
                return loop()
            }
    
            // If we're at this point; compare playing artist to target.
            if (r.data["Station.Engage.NowPlaying"].now_playing.artist === artistName) {
                log.log(`\x1b[32mMatch detected! ${artistName} is currently playing on ${apiKey}!`);
                table.setData(
                    { headers: ['Artist', 'Matches']
                    , data:
                        [ [artistName, matches++]]})
            } else {
                log.log(`\x1b[33m${artistName} is not playing on ${apiKey}; ${r.data["Station.Engage.NowPlaying"].now_playing.artist} is.`);
            }
    
            // Wait for the song to finish playing, and then scan again when the next one starts.
            log.log(`\x1b[35mWaiting ${r.data["Station.Engage.NowPlaying"].now_playing.seconds_left * 1000} ms for the song to finish playing.`)
            pollingRate = r.data["Station.Engage.NowPlaying"].now_playing.seconds_left * 1000
            loop()
        })
        .catch((e) => {
            log.log(`\x1b[31mFailed to get the current playing song: ${e}`)
        })
    }, pollingRate)
}

loop()