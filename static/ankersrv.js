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
                newSeries.push({'id':'ecur','data':temperatures.extruder.actual});
            }
            if ('targetTemp' in jsonData){
                temperatures.extruder.target.push([now,(jsonData.targetTemp/100)]);
                newSeries.push({'id':'etar','data':temperatures.extruder.target});
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
                newSeries.push({'id':'bcur','data':temperatures.bed.actual});
            }
            if ('targetTemp' in jsonData){
                temperatures.bed.target.push([now,(jsonData.targetTemp/100)]);
                newSeries.push({'id':'btar','data':temperatures.bed.target});
            }
            if (newSeries.length > 0){
                tempChart.setOption({ 'series': newSeries });
            }
        },

         // bed temp data
        '1052': function () {
            if ('total_layer' in jsonData && 'real_print_layer' in jsonData){
                let perLayer = (jsonData.total_layer / jsonData.real_print_layer)*100;
                if (isNaN(perLayer)){
                    perLayer = 0;
                }else{
                    perLayer = Math.round(perLayer);
                }
                $('#layerprogress').css('width',perLayer + "%");
            }
        },

        // files data
        '1009': function () {
            if ('fileLists' in jsonData ){
                let ul = $('<div class="list-group">');
                let li = $('<a href="#" class="list-group-item list-group-item-action"><div class="d-flex w-100 justify-content-between"><h5 class="mb-1"></h5><small></small></div><p class="mb-1"></p></a>')
                let fileList = JSON.parse(jsonData.fileLists);
                let tarList = false
                $.each(fileList,function(key,val){
                    if (tarList == false){
                        if (val.path.includes('/usr/data/local/model/')){
                            tarList = 'filesprinter';
                        }else if (val.path.includes('/tmp/udisk/udisk1/')){
                            tarList = 'filesusb';
                        }else{
                            tarList = 'fileshost';
                        }
                    }
                    li.find('div>h5').html(val.name);
                    li.find('p').html(val.name);
                    li.find('div>small').html(new Date(val.timestamp*1000).toLocaleString());
                    ul.append(li.clone());
                });
                if (tarList !== false){
                    $('#'+tarList + " > div").replaceWith(ul);
                }
            }
        },

        'errorType': function () {
             console.error('Unhandled commandType', jsonData);
        }
    };

    let templates =  $('[data-cmd-template^="'+jsonData.commandType+':"]');
    if (templates.length){
        templates.each(function(){
            let datKey = $(this).data('cmd-template').split(":")[1];
            if (datKey in jsonData){
                $(this).html(jsonData[datKey]);
            }
        })
    }

    (cmdHandler[jsonData.commandType] || cmdHandler['errorType'])();
}



$(function () {
    // mqtt websocket
    let socket = new WebSocket("ws://" + location.host + "/ws/mqtt");
    socket.addEventListener('message', ev => {
        WebSocketHandler(ev.data);
    });

    // Build basic temp chart
    tempChart = echarts.init(document.getElementById('tempchart'));
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
                type : 'value',
                nameTextStyle:{
                    padding: [25, 4, 4, 50]
                }
            }
        ],
        grid: {
          left: '6%',
          top: 35,
          right: '6%',
          bottom: 35
        },
        series : [
            {
                id: 'ecur',
                name:'Extruder current',
                type:'line',
                smooth:true,
            },
            {
                id: 'etar',
                name:'Extruder target',
                type:'line',
                smooth:true,
            },
            {
                id: 'bcur',
                name:'Bed current',
                type:'line',
                smooth:true,
                data: []
            },
            {
                id: 'btar',
                name:'Bed target',
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

    // Get files
    $('#filenavbar button[data-bs-toggle="tab"]').each(function(){
        this.addEventListener('shown.bs.tab', event => {
            $($(event.target).data('bs-target')).html('<div class="text-center"><div class="spinner-border text-center" role="status"><span class="visually-hidden">Loading...</span></div></div>');
            fetch('/api/ankerctl/getFiles?type='+$(event.target).data('fileid'), {
                method: 'get',
                headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
                }
            });
        });
    })
    // Autload first
    $('#filenavbar button[data-bs-toggle="tab"]').first()[0].dispatchEvent(new Event("shown.bs.tab"));
});
