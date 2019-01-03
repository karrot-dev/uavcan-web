# web interface for UAVCAN stuff

*status*: early stage

System dependencies are:
* python3
* pip
* virtualenv (optional)
* the can driver thing (not sure the name or how to check, hopefully it's just in your kernel already)

## Quickstart

Create and activate virtualenv:

```
virtualenv --no-site-packages env
source env/bin/activate
```

Install pip tools:

```
pip install pip-tools
```

Install the libraries:

```
pip-sync
```

Create a local configuration file, e.g. `local_settings.ini`:

``` 
[canbus]

ifname = vcan0

[node]

id = 112
name = uavcan-web-dev
```

Then start the dev server:

```
python web.py local_settings.ini
```

## API

The application exposes an HTTP API:

### GET /api/nodes

Return a list of nodes and when they were last seen, e.g.:

```
curl -s http://127.0.0.1:8000/api/nodes
```

```json
{
  "nodes": [
    {
      "id": 100,
      "last_seen": "Thu, 03 Jan 2019 21:57:09 GMT"
    },
    {
      "id": 7,
      "last_seen": "Thu, 03 Jan 2019 21:57:09 GMT"
    }
  ]
}
```


### GET /api/nodes/:node_id

Get information about a specific node, e.g.:

```
curl -s http://127.0.0.1:8000/api/nodes/6 | jq .
```

```json
{
  "hardware_version": {
    "certificate_of_authenticity": "",
    "major": 0,
    "minor": 0,
    "unique_id": [
      53,
      0,
      29,
      0,
      2,
      87,
      52,
      71,
      56,
      55,
      52,
      32,
      0,
      0,
      0,
      0
    ]
  },
  "name": "K20-B Greywater pump",
  "software_version": {
    "image_crc": 0,
    "major": 0,
    "minor": 1,
    "optional_field_flags": 1,
    "vcs_commit": 151677509
  },
  "status": {
    "health": 0,
    "mode": 0,
    "sub_mode": 0,
    "uptime_sec": 122711,
    "vendor_specific_status_code": 3302
  }
}
```

### POST /api/nodes/:node_id/:action

Make a node request, action will get `uavcan.` prepended to it (e.g. `protocol.GetNodeInfo` -> `uavcan.protocol.GetNodeInfo`).

JSON post data will be passed as params.

e.g.:

```
curl -s -XPOST http://localhost:8000/api/nodes/5/protocol.GetNodeInfo | jq .
```

```json
{
  "hardware_version": {
    "certificate_of_authenticity": "",
    "major": 0,
    "minor": 0,
    "unique_id": [
      76,
      0,
      63,
      0,
      21,
      81,
      77,
      75,
      53,
      53,
      52,
      32,
      0,
      0,
      0,
      0
    ]
  },
  "name": "K20-outside thermometer",
  "software_version": {
    "image_crc": 0,
    "major": 0,
    "minor": 1,
    "optional_field_flags": 1,
    "vcs_commit": 1527198
  },
  "status": {
    "health": 0,
    "mode": 0,
    "sub_mode": 0,
    "uptime_sec": 126437,
    "vendor_specific_status_code": 3288
  }
}
``` 

## Style

Run:

```
yapf -i web.py
```

## Cannelloni

If you want to connect to the uavcan network from your laptop, install cannelloni then run:

```
sudo modprobe vcan
sudo ip link add name vcan0 type vcan
sudo ip link set dev vcan0 up
cannelloni -S c -R 192.168.178.164 -t 10000
```

## Deployment

You can run it with gunicorn like this: 

```
gunicorn web:app
```

## TODO

- [ ] add basic error handling
- [ ] whitelist valid actions
- [ ] make sure actions can accept the parameters via json post (didn't try it, probably doesn't quite work)
- [ ] make a basic web UI