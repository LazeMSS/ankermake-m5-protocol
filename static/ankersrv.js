let temperatures = {
    'bed' : {
        'actual': [],
        'target': []
    },
    'extruder' : {
        'actual':[],
        'target':[]
    }
}

let tempChart = null;
let wsctrl = null;

function WebSocketHandler(data){
    let jsonData = null;
    try {
        jsonData = JSON.parse(data);
    } catch(e) {
        console.error(e);
        return;
    }
    if (! 'commandType' in jsonData){
        console.error('No commandType', jsonData);
        return;
    }
    let now = Date.now();

    var cmdHandler = {
        // extruder temp data
        '1003': function () {
            let newSeries = [];
            if ('currentTemp' in jsonData){
                temperatures.extruder.actual.push([now,(jsonData.currentTemp/100)]);
                newSeries.push({'name':'E current','data':temperatures.extruder.actual});
            }
            if ('targetTemp' in jsonData){
                temperatures.extruder.target.push([now,(jsonData.targetTemp/100)]);
                newSeries.push({'name':'E target','data':temperatures.extruder.target});
            }
            if (newSeries.length > 0){
                tempChart.setOption({ 'series': newSeries });
            }
        },

        // bed temp data
        '1004': function () {
            let newSeries = [];
            if ('currentTemp' in jsonData){
                temperatures.bed.actual.push([now,(jsonData.currentTemp/100)]);
                newSeries.push({'name':'B current','data':temperatures.bed.actual});
            }
            if ('targetTemp' in jsonData){
                temperatures.bed.target.push([now,(jsonData.targetTemp/100)]);
                newSeries.push({'name':'B target','data':temperatures.bed.target});
            }
            if (newSeries.length > 0){
                tempChart.setOption({ 'series': newSeries });
            }
        },

        'errorType': function () {
             console.error('Unhandled commandType', jsonData);
        }
    };

    (cmdHandler[jsonData.commandType] || cmdHandler['errorType'])();
}



$(function () {
    // mqtt websocket
    let socket = new WebSocket("ws://" + location.host + "/ws/mqtt");
    socket.addEventListener('message', ev => {
        WebSocketHandler(ev.data);
    });

    // Build basic temp chart
    tempChart = echarts.init(document.getElementById('tempChart'));
    var option;
    option = {
        tooltip : {
            trigger: 'axis'
        },
        calculable : true,
        xAxis : [
            {
                type: 'time',
                boundaryGap:false,
                axisLabel: {
                    formatter: '{HH}:{mm}'
                }
            }
        ],
        yAxis : [
            {
                name : 'Temperature °C',
                nameGap: 15,
                min: 0,
                minInterval: 1,
                type : 'value'
            }
        ],
        grid: {
          left: '8%',
          top: 30,
          right: '5%',
          bottom: 20
        },
        series : [
            {
                name:'E current',
                type:'line',
                smooth:true,
            },
            {
                name:'E target',
                type:'line',
                smooth:true,
            },
            {
                name:'B current',
                type:'line',
                smooth:true,
                data: []
            },
            {
                name:'B target',
                type:'line',
                smooth:true,
                data: []
            }
        ]
    }
    option && tempChart.setOption(option);

    var jmuxer;
    jmuxer = new JMuxer({
        node: 'player',
        mode: 'video',
        flushingTime: 0,
        fps: 15,
        // debug: true,
        onReady: function(data) {
            console.log(data);
        },
        onError: function(data) {
            console.error(data);
        }
    });

    // Video stream socket
    var videoWS = new WebSocket("ws://" + location.host + "/ws/video");
    videoWS.binaryType = 'arraybuffer';
    videoWS.addEventListener('message',function(event) {
        jmuxer.feed({
            video: new Uint8Array(event.data)
        });
    });

    videoWS.addEventListener('error', function(e) {
        console.error('WebSocket video Error',e);
    });

    wsctrl = new WebSocket("ws://" + location.host + "/ws/ctrl");

    $('[data-light-control]').on('click', function() {
        wsctrl.send(JSON.stringify({"light": $(this).data('light-control')}));
        return false;
    });

});
