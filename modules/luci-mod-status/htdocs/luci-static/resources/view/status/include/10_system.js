'use strict';
'require baseclass';
'require fs';
'require rpc';
'require poll';

var lastTotal = 0;
var lastIdle = 0;

var callSystemBoard = rpc.declare({
  object: 'system',
  method: 'board'
});

var callSystemInfo = rpc.declare({
  object: 'system',
  method: 'info'
});

var callCPUBench = rpc.declare({
  object: 'luci',
  method: 'getCPUBench'
});

var callCPUInfo = rpc.declare({
  object: 'luci',
  method: 'getCPUInfo'
});

var callTempInfo = rpc.declare({
  object: 'luci',
  method: 'getTempInfo'
});

function parseCPUUsage(stat) {
  if (!stat)
    return '?';

  var line = stat.split('\n')[0].trim().split(/\s+/);

  if (line[0] != 'cpu')
    return '?';

  var user = parseInt(line[1], 10) || 0;
  var nice = parseInt(line[2], 10) || 0;
  var system = parseInt(line[3], 10) || 0;
  var idle = parseInt(line[4], 10) || 0;
  var iowait = parseInt(line[5], 10) || 0;
  var irq = parseInt(line[6], 10) || 0;
  var softirq = parseInt(line[7], 10) || 0;

  var total = user + nice + system + idle + iowait + irq + softirq;
  var idleAll = idle + iowait;

  if (lastTotal === 0) {
    lastTotal = total;
    lastIdle = idleAll;
    return '?';
  }

  var totalDiff = total - lastTotal;
  var idleDiff = idleAll - lastIdle;

  lastTotal = total;
  lastIdle = idleAll;

  if (totalDiff <= 0)
    return '?';

  return (((totalDiff - idleDiff) / totalDiff) * 100).toFixed(1) + '%';
}

return baseclass.extend({
  title: _('System'),

  load: function() {
    return Promise.all([
      L.resolveDefault(callSystemBoard(), {}),
      L.resolveDefault(callSystemInfo(), {}),
      L.resolveDefault(callCPUBench(), {}),
      L.resolveDefault(callCPUInfo(), {}),
      L.resolveDefault(callTempInfo(), {}),
      L.resolveDefault(fs.read('/sys/class/thermal/thermal_zone0/temp'), null),
      L.resolveDefault(fs.read('/proc/stat'), null)
    ]);
  },

  render: function(data) {
    var boardinfo = data[0],
      systeminfo = data[1],
      cpubench = data[2],
      cpuinfo = data[3],
      tempinfo = data[4],
      thermalraw = data[5],
      procstat = data[6];

    var datestr = null;

    if (systeminfo.localtime) {
      var date = new Date(systeminfo.localtime * 1000);

      datestr = '%04d-%02d-%02d %02d:%02d:%02d'.format(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds()
      );
    }

    var zoneTemp = null;
    if (thermalraw) {
      var t = parseInt(thermalraw.trim(), 10);
      if (!isNaN(t))
        zoneTemp = (t / 1000).toFixed(1) + ' °C';
    }

    var cpuTemp = null;

    if (tempinfo.tempinfo) {
      var m = tempinfo.tempinfo.match(/(\d+(\.\d+)?)\s*°?C/i);
      if (m)
        cpuTemp = parseFloat(m[1]).toFixed(1) + '°C';
    }

    if (!cpuTemp && cpuinfo.cpuinfo) {
      var m2 = cpuinfo.cpuinfo.match(/(\d+(\.\d+)?)\s*°?C/i);
      if (m2)
        cpuTemp = parseFloat(m2[1]).toFixed(1) + '°C';
    }

    var cores = '4';
    if (cpuinfo.cpuinfo) {
      var c = cpuinfo.cpuinfo.match(/x\s*(\d+)/i);
      if (c)
        cores = c[1];
    }

    var temperature = null;

    if (zoneTemp && cpuTemp)
      temperature = zoneTemp + ' / ARMv8 ' + cpuTemp + ' x' + cores;
    else if (zoneTemp)
      temperature = zoneTemp;
    else if (cpuTemp)
      temperature = 'ARMv8 ' + cpuTemp + ' x' + cores;

    var firmware = '';
    if (L.isObject(boardinfo.release) && boardinfo.release.description)
      firmware = boardinfo.release.description.replace(/\s+r[0-9a-fA-F\.\-~]+.*$/, '');
    var version = firmware + ' / k' + boardinfo.kernel;
    var cpuUsage = parseCPUUsage(procstat);
    var table = E('table', { 'class': 'table' });
    var fields = [
      _('Model'), boardinfo.model + cpubench.cpubench,
      _('Temperature'), temperature,
      _('Version'), version,
      _('Local Time'), datestr,
      _('Uptime'), systeminfo.uptime ? '%t'.format(systeminfo.uptime) : null,
      _('CPU usage (%)'), E('span', { id: 'doty_cpu_usage' }, cpuUsage),
      _('Build Date'), '02 Mei 2026',
      _('Builded By'), 'Dotycat.com'
    ];

    for (var i = 0; i < fields.length; i += 2) {
      table.appendChild(E('tr', { 'class': 'tr' }, [
        E('td', { 'class': 'td left', 'width': '33%' }, [fields[i]]),
        E('td', { 'class': 'td left' }, [(fields[i + 1] != null) ? fields[i + 1] : '?'])
      ]));
    }

    poll.add(function() {
      return fs.read('/proc/stat').then(function(stat) {
        var el = document.getElementById('doty_cpu_usage');
        var val = parseCPUUsage(stat);

        if (el && val !== '?')
          el.textContent = val;
      });
    }, 5);

    return table;
  }
});
