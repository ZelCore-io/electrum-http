const ElectrumCli = require('electrum-client');
const qs = require('qs');
const Ddos = require('ddos');
const bitgotx = require('bitgo-utxo-lib');

const ddos = new Ddos({ burst: 25, limit: 100 });
const express = require('express');

const app = express();
app.use(ddos.express);

const conTypeDefault = 'tls'; // tcp or tls
const conPortDefault = 50002;
const coinDefault = 'bitcoin';
const listeningPort = 3456;

app.use((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', '*');

  let decMyCP = decodeURIComponent(req.url);
  decMyCP = decMyCP.split('/?')[1];
  const parsed = qs.parse(decMyCP);

  let { call } = parsed;
  let { param } = parsed;
  let { server } = parsed;
  const conPort = parsed.port || conPortDefault;
  const conType = parsed.contype || conTypeDefault;
  const coin = parsed.coin || coinDefault;

  // support backwards compatibility
  let x;
  let y;
  let eclCall = '';
  if (!call || !server) {
    x = req.url.split('?param=');
    param = x[1];
    y = x[0].split('?call=');
    call = y[1];
    const z = y[0].split('?server=');
    server = z[1];
  }

  // support mobile mistake where it was ?param
  if (call !== 'height' && call !== undefined && param === undefined) {
    x = req.url.split('?param=');
    param = x[1];
    y = x[0].split('&call=');
    call = y[1];
  }

  if (!call) {
    res.write('Error: Call is undefined');
    res.end();
    return;
  }

  if (!server) {
    res.write('Error: Server is undefined');
    res.end();
    return;
  }

  let network = bitgotx.networks.bitcoin;
  if (param) {
    try {
      network = bitgotx.networks[coin];
    } catch (e) {
      console.log(e);
      res.write('Error: Invalid coin network specified');
      res.end();
      return;
    }
  }

  async function oneparam(limitHistory) {
    const ecl = new ElectrumCli(conPort, server, conType);
    await ecl.connect()
      .catch((error) => {
        console.log(error);
        res.write(JSON.stringify(error));
        res.end();
      }); // connect(promise)
    try {
      if (call === 'balance' || call === 'history' || call === 'entirehistory' || call === 'utxo') {
        const paramBuffer = bitgotx.address.toOutputScript(
          param,
          network,
        );
        const scriptHash = bitgotx.crypto.sha256(paramBuffer).reverse().toString('hex');
        console.log(scriptHash);
        param = scriptHash;
        console.log(bitgotx.address.fromOutputScript(paramBuffer, network));
      }
      const ver = await ecl[eclCall](
        param,
      ); // json-rpc(promise)
        // console.log(ver)
      if (eclCall === 'blockchainScripthash_listunspent') {
        ecl.close();
        const slicedArray = ver.slice(0, 600);
        const verString = JSON.stringify(slicedArray);
        res.write(verString);
        res.end();
      } else if (eclCall === 'blockchainScripthash_getHistory' && limitHistory) {
        if (ver.length > 200) {
          ecl.close();
          const { length } = ver;
          const slicedArray = ver.slice(length - 100, length);
          const verString = JSON.stringify(slicedArray);
          res.write(verString);
          res.end();
        } else {
          ecl.close();
          const verString = JSON.stringify(ver);
          res.write(verString);
          res.end();
        }
      } else {
        ecl.close();
        const verString = JSON.stringify(ver);
        res.write(verString);
        res.end();
      }
    } catch (e) {
      ecl.close();
      res.write(`Error: ${e.message}`);
      res.end();
    }
  }

  async function zeroparam() {
    const ecl = new ElectrumCli(conPort, server, conType);
    await ecl.connect()
      .catch((error) => {
        console.log(error);
        res.write(JSON.stringify(error));
        res.end();
      }); // connect(promise)
    try {
      const ver = await ecl[eclCall](); // json-rpc(promise)
      // console.log(ver)
      ecl.close();
      const verString = JSON.stringify(ver);
      res.write(verString);
      res.end();
    } catch (e) {
      ecl.close();
      console.log(e);
      res.write(`Error: ${e.message}`);
      res.end();
    }
  }

  async function nicehistory(amountoftxs) {
    const address = param;
    console.log(address);
    const ecl = new ElectrumCli(conPort, server, conType);
    await ecl.connect()
      .catch((error) => {
        console.log(error);
        res.write(JSON.stringify(error));
        res.end();
      }); // connect(promise)
    try {
      const paramBuffer = bitgotx.address.toOutputScript(
        address,
        network,
      );
      const scriptHash = bitgotx.crypto.sha256(paramBuffer).reverse().toString('hex');

      const response = await ecl.blockchainScripthash_getHistory(
        scriptHash,
      );
      // console.log(response);
      const myarray = response;
      const currentTimestamp = Math.round(new Date() / 1000);
      const ver = myarray.reverse();
      const limit = Math.min(ver.length, amountoftxs); // maximum of txs to fetch
      const lightTransactions = [];
      if (limit === 0) {
        ecl.close();
        res.write(JSON.stringify(lightTransactions));
        res.end();
      }

      const txUrls = [];
      for (let i = 0; i < limit; i += 1) {
        txUrls.push(ver[i].tx_hash);
      }
      // console.log(txUrls);
      const txsPromise = txUrls.map((l) => ecl.blockchainTransaction_get_verbose(l));
      Promise.all(txsPromise, { timeout: 30000 })
        .then((responseB) => {
          for (let j = 0; j < limit; j += 1) {
            const txHeight = ver[j].height;
            const rawtx = responseB[j].hex;
            const tx = bitgotx.Transaction.fromHex(rawtx, network);
            const result = {
              txid: responseB[j].txid,
              version: responseB[j].version,
              locktime: responseB[j].locktime,
              vin: [],
              vout: [],
              time: responseB[j].time || currentTimestamp,
              confirmations: responseB[j].confirmations || 0,
              valueInSat: 0,
              valueOutSat: 0,
              fees: 0,
              height: txHeight,
              hex: responseB[j].hex || undefined,
            };
            // console.log(tx);
            // console.log(result);
            const insFetching = new Promise((resolve) => {
              tx.ins.forEach((input, index, array) => {
                const myvin = {
                  txid: !input.hash.reverse
                    ? input.hash
                    : input.hash.reverse().toString('hex'),
                  n: input.index,
                  script: bitgotx.script.toASM(input.script),
                  sequence: input.sequence,
                  scriptSig: {
                    hex: input.script.toString('hex'),
                    asm: bitgotx.script.toASM(input.script),
                  },
                  addr: '',
                  value: 0,
                  valueSat: 0,
                  satoshis: 0,
                };
                if (!myvin.txid.includes('00000000000000000000000000000')) {
                  ecl.blockchainTransaction_get_nonverbose(myvin.txid)
                    .then((responseInput) => {
                      if (coin === 'raptoreum' && responseInput.includes('03000500010000000000000000000000000000000000000000000000000000000000000000ff')) {
                        if (index === array.length - 1) {
                          setTimeout(() => {
                            resolve();
                          }, 888);
                        }
                        return;
                      }
                      const inputRes = responseInput;
                      // console.log(myvin.txid);
                      // console.log(inputRes);
                      const vintx = bitgotx.Transaction.fromHex(inputRes, network);
                      const vinOutTx = vintx.outs[myvin.n];
                      myvin.valueSat = vinOutTx.value;
                      myvin.satoshis = vinOutTx.value;
                      myvin.value = (1e-8 * vinOutTx.value);
                      result.valueInSat += vinOutTx.value;
                      result.fees += vinOutTx.value;
                      const type = bitgotx.script.classifyOutput(vinOutTx.script);
                      let pubKeyBuffer;
                      switch (type) {
                        case 'pubkeyhash':
                          myvin.addr = bitgotx.address.fromOutputScript(
                            vinOutTx.script,
                            network,
                          );
                          break;
                        case 'pubkey':
                          try {
                            pubKeyBuffer = Buffer.from(
                              myvin.scriptSig.asm.split(' ')[0],
                              'hex',
                            );
                            myvin.addr = bitgotx.ECPair.fromPublicKeyBuffer(
                              pubKeyBuffer,
                              network,
                            ).getAddress();
                          } catch (error) {
                            console.log(error);
                          }
                          break;
                        case 'scripthash':
                          myvin.addr = bitgotx.address.fromOutputScript(
                            vinOutTx.script,
                            network,
                          );
                          break;
                        default:
                          /* Do nothing */
                          break;
                      }
                      result.vin.push(myvin);
                      if (index === array.length - 1) resolve();
                    })
                    .catch((e) => {
                      console.log(e);
                      ecl.close();
                      res.write(`Error: ${e.message}`);
                      res.end();
                    });
                } else if (index === array.length - 1) {
                  setTimeout(() => {
                    resolve();
                  }, 888);
                }
              });
            });

            insFetching.then(() => {
              responseB[j].vout.forEach((vout) => {
                // eslint-disable-next-line no-param-reassign
                vout.satoshi = vout.value * 1e8;
                // eslint-disable-next-line no-param-reassign
                vout.valueSat = vout.value * 1e8;
                result.valueOutSat += (vout.value * 1e8);
                result.fees -= (vout.value * 1e8);
                result.vout.push(vout);
              });
              lightTransactions.push(result);
              if (lightTransactions.length === limit) {
                ecl.close();
                res.write(JSON.stringify(lightTransactions));
                res.end();
              }
            });
          }
        })
        .catch((e) => {
          ecl.close();
          console.log(e);
          res.write(`Error: ${e.message}`);
          res.end();
        });
    } catch (e) {
      ecl.close();
      res.write(`Error: ${e.message}`);
      res.end();
    }
  }

  async function niceutxo() {
    const address = param;
    console.log(address);
    const ecl = new ElectrumCli(conPort, server, conType);
    await ecl.connect()
      .catch((error) => {
        console.log(error);
        res.write(JSON.stringify(error));
        res.end();
      }); // connect(promise)
    try {
      const paramBuffer = bitgotx.address.toOutputScript(
        param,
        network,
      );
      const scriptHash = bitgotx.crypto.sha256(paramBuffer).reverse().toString('hex');
      const scriptPubKey = bitgotx.address.toOutputScript(
        address,
        network,
      ).toString('hex');
      const ver = await ecl.blockchainScripthash_listunspent(
        scriptHash,
      );
      ecl.close();
      const utxos = ver.slice(0, 600);
      const niceUtxos = [];
      for (let i = 0; i < utxos.length; i += 1) {
        if (utxos[i].height !== 0) { // if === 0, continue
          niceUtxos.push({
            txid: utxos[i].tx_hash,
            vout: utxos[i].tx_pos,
            scriptPubKey,
            satoshis: utxos[i].value,
            height: utxos[i].height,
          });
        }
      }
      res.write(JSON.stringify(niceUtxos));
      res.end();
    } catch (e) {
      ecl.close();
      res.write(`Error: ${e.message}`);
      res.end();
    }
  }

  // eslint-disable-next-line default-case
  switch (call) {
    case 'balance':
      eclCall = 'blockchainScripthash_getBalance';
      oneparam();
      break;
    case 'history':
      eclCall = 'blockchainScripthash_getHistory';
      oneparam(true);
      break;
    case 'entirehistory':
      eclCall = 'blockchainScripthash_getHistory';
      oneparam(false);
      break;
    case 'transaction':
      eclCall = 'blockchainTransaction_get';
      oneparam();
      break;
    case 'transactionnonverbose':
      eclCall = 'blockchainTransaction_get_nonverbose';
      oneparam();
      break;
    case 'transactionverbose':
      eclCall = 'blockchainTransaction_get_verbose';
      oneparam();
      break;
    case 'utxo':
      eclCall = 'blockchainScripthash_listunspent';
      oneparam();
      break;
    case 'broadcast':
      eclCall = 'blockchainTransaction_broadcast';
      oneparam();
      break;
    case 'height':
      eclCall = 'blockchainHeaders_subscribe';
      zeroparam();
      break;
    case 'header':
      eclCall = 'blockchainBlock_getHeader';
      oneparam();
      break;
    case 'nicehistory':
      nicehistory(30);
      break;
    case 'niceentirehistory':
      nicehistory(30000);
      break;
    case 'niceutxo':
      niceutxo();
      break;
  }
});

app.listen(listeningPort, () => {
  console.log(`App listening on ${listeningPort}`);
});

process.on('uncaughtException', (exception) => {
  console.log(exception);
});
