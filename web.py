import sys

import configparser
import os
import queue
import signal
import threading
import uavcan
import yaml
from collections import defaultdict
from datetime import datetime
from flask import Flask, jsonify, request as flask_request, send_from_directory

app = Flask(__name__)

running = True


def shutdown(signal, frame):
    global running
    running = False


def read_config(filename=None):
    config = configparser.ConfigParser()
    config.read(os.path.join(os.path.dirname(__file__), 'defaults.ini'))
    if filename is not None:
        config.read(filename)
    return config


config_filename = sys.argv[1:]
config = read_config(config_filename)

request_queue = queue.Queue()
node_infos = defaultdict(lambda: dict(last_seen=None))


def get_request_class(name):
    parts = name.split('.')
    thing = uavcan
    while len(parts) > 0:
        part = parts.pop(0)
        thing = getattr(thing, part)
    return getattr(thing, 'Request')


def make_request(node_id, request):
    response_queue = queue.Queue()
    request_queue.put({
        'node_id': node_id,
        'request': request,
        'response_queue': response_queue,
    })
    event = response_queue.get(timeout=10)
    return yaml.load(uavcan.introspect.to_yaml(event.transfer.payload))


@app.route("/api/nodes")
def nodes():
    return jsonify({'nodes': [{'id': id, **node_info} for id, node_info in node_infos.items()]})


@app.route("/api/nodes/<int:node_id>")
def node_status(node_id):
    data = make_request(node_id, uavcan.protocol.GetNodeInfo.Request())
    return jsonify(data)


def extract_union_value(value):
    field = value._fields[value._union_field]
    if getattr(field._type, 'is_string_like', False):
        return field.decode()
    else:
        return field.value


@app.route("/api/nodes/<int:node_id>/params", methods=['GET'])
def uavcan_list_params(node_id):
    parallel_count = 5  # if set to 7 or higher, we get a None response from pyuavcan for the last item
    inflight_requests = 0
    index = 0
    params = []
    response_queue = queue.Queue()
    received_empty_response = False
    while True:
        while inflight_requests < parallel_count and not received_empty_response:
            request_queue.put({
                'node_id': node_id,
                'request': uavcan.protocol.param.GetSet.Request(index=index),
                'response_queue': response_queue
            })
            index += 1
            inflight_requests += 1
        data = response_queue.get(timeout=10)
        inflight_requests -= 1
        payload = data.transfer.payload
        name = str(payload.name)
        if len(name) == 0:
            received_empty_response = True
        else:
            params.append({'name': name, 'value': extract_union_value(payload.value)})
        if inflight_requests == 0:
            break

    return jsonify(params)


@app.route("/api/nodes/<int:node_id>/params/<name>", methods=['GET', 'POST'])
def uavcan_param_getset(node_id, name):
    request_data = {'name': name}
    if flask_request.method == 'POST':
        if flask_request.json is not None:
            value = flask_request.json.get('value')
            if isinstance(value, int):
                request_data['value'] = uavcan.protocol.param.Value(integer_value=value)
            else:
                request_data['value'] = uavcan.protocol.param.Value(string_value=str(value))

    data = make_request(node_id, uavcan.protocol.param.GetSet.Request(**request_data))
    return jsonify(data)


@app.route('/<path:path>')
def send_public(path):
    return send_from_directory('public', path)


@app.route('/')
def root():
    return send_public('index.html')


def run_uavcan(node_infos, request_queue):
    if getattr(uavcan.thirdparty, 'homeautomation', None) is None:
        uavcan.load_dsdl(os.path.join(os.path.dirname(__file__), 'dsdl_files', 'homeautomation'))

    node_info = uavcan.protocol.GetNodeInfo.Response()
    node_info.name = config.get('node', 'name')

    node = uavcan.make_node(
        config.get('canbus', 'ifname'),
        node_id=config.getint('node', 'id'),
        node_info=node_info,
    )

    node.mode = uavcan.protocol.NodeStatus().MODE_OPERATIONAL
    node.health = uavcan.protocol.NodeStatus().HEALTH_OK

    def node_status_cb(event):
        node_infos[event.transfer.source_node_id]['last_seen'] = datetime.now()

    node.add_handler(uavcan.protocol.NodeStatus, node_status_cb)

    while running:
        try:
            node.spin(0.2)

            while not request_queue.empty():
                request = request_queue.get_nowait()
                response_queue = request['response_queue']
                node.request(
                    request['request'],
                    request['node_id'],
                    lambda event: response_queue.put(event),
                )
                request_queue.task_done()
        except uavcan.UAVCANException as ex:
            print('Node error:', ex)


def start_uavcan_thread():
    threading.Thread(
        target=run_uavcan, kwargs={
            'node_infos': node_infos,
            'request_queue': request_queue,
        }
    ).start()


start_uavcan_thread()

if __name__ == '__main__':
    app.run(debug=True)
else:
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
