// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ISomniaAgents.sol";
import "./interfaces/IPoolFactory.sol";
import "./interfaces/IPool.sol";

library Tools {
    bytes4 constant SWAP = bytes4(keccak256("swap(string,string,uint256)"));
    bytes4 constant GLOBAL_STATE = bytes4(keccak256("get_pool_global_state(address,address)"));
    bytes4 constant POOL_LIQUIDITY = bytes4(keccak256("get_pool_liquidity(address,address)"));
    bytes4 constant POOL_FEE = bytes4(keccak256("get_pool_fee(address,address)"));

    address constant FACTORY = 0x13fa49215C180Acce0f5EEcB7d4900987d407930;
    address constant QUICKSWAP = 0xE94de02e52Eaf9F0f6Bf7f16E4927FcBc2c09bC7;
    address constant USDC = 0xE9CC37904875B459Fa5D0FE37680d36F1ED55e38;
    address constant WETH = 0xd2480162Aa7F02Ead7BF4C127465446150D58452;
    address constant WSTT = 0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7;

    function getOnchainTools() internal pure returns (ILLMAgent.OnchainTool[] memory tools) {
        tools = new ILLMAgent.OnchainTool[](4);
        tools[0] = ILLMAgent.OnchainTool("swap(string tokenInSymbol, string tokenOutSymbol, uint256 amountIn)", "Prepare a Quickswap exactInputSingle swap. tokenInSymbol and tokenOutSymbol are token symbols like STT, USDC, WETH, WSTT. amountIn is in wei. Returns the swap function call params for the user to execute.");
        tools[1] = ILLMAgent.OnchainTool("get_pool_global_state(address tokenA, address tokenB)", "Get the pool sqrtPrice, tick and lastFee for a token pair. tokenA and tokenB are token contract addresses. Uses factory.poolByPair then pool.globalState(). Returns price, tick, lastFee.");
        tools[2] = ILLMAgent.OnchainTool("get_pool_liquidity(address tokenA, address tokenB)", "Get the currently in-range active liquidity for a token pair. tokenA and tokenB are token contract addresses. Uses factory.poolByPair then pool.liquidity(). Returns activeLiquidity.");
        tools[3] = ILLMAgent.OnchainTool("get_pool_fee(address tokenA, address tokenB)", "Get the current pool fee for a token pair. tokenA and tokenB are token contract addresses. Uses factory.poolByPair then pool.fee(). Returns currentFee.");
    }

    function executeSwap(bytes memory params) internal pure returns (bytes memory result) {
        (string memory tokenInSymbol, string memory tokenOutSymbol, uint256 amountIn) = abi.decode(params, (string, string, uint256));
        address tokenIn = _resolveToken(tokenInSymbol);
        address tokenOut = _resolveToken(tokenOutSymbol);
        string memory resultStr;
        if (tokenIn == address(0) && !_isSTT(tokenInSymbol)) {
            resultStr = string.concat("Unsupported token: ", tokenInSymbol);
        } else if (tokenOut == address(0) && !_isSTT(tokenOutSymbol)) {
            resultStr = string.concat("Unsupported token: ", tokenOutSymbol);
        } else {
            resultStr = string.concat(
                "Quickswap exactInputSingle on ", _addressToString(QUICKSWAP),
                " | tokenIn: ", _addressToString(tokenIn),
                " | tokenOut: ", _addressToString(tokenOut),
                " | amountIn: ", _uintToString(amountIn),
                " | fee: 3000 | recipient: <user> | deadline: <now+5min>"
            );
        }
        result = abi.encode(resultStr);
    }

    function executeGlobalState(bytes memory params) internal view returns (bytes memory result) {
        (address tokenA, address tokenB) = abi.decode(params, (address, address));
        address pool = IAlgebraFactory(FACTORY).poolByPair(tokenA, tokenB);
        string memory resultStr;
        if (pool == address(0)) {
            resultStr = "No pool found for this pair";
        } else {
            (uint160 price, int24 tick, uint16 lastFee,,,) = IAlgebraPoolState(pool).globalState();
            resultStr = string.concat(
                '{"pool":"', _addressToString(pool),
                '","price":"', _uintToString(price),
                '","tick":', _int24ToString(tick),
                ',"lastFee":', _uintToString(lastFee),
                '}'
            );
        }
        result = abi.encode(resultStr);
    }

    function executePoolLiquidity(bytes memory params) internal view returns (bytes memory result) {
        (address tokenA, address tokenB) = abi.decode(params, (address, address));
        address pool = IAlgebraFactory(FACTORY).poolByPair(tokenA, tokenB);
        string memory resultStr;
        if (pool == address(0)) {
            resultStr = "No pool found for this pair";
        } else {
            uint128 liq = IAlgebraPoolState(pool).liquidity();
            resultStr = string.concat(
                '{"pool":"', _addressToString(pool),
                '","activeLiquidity":"', _uintToString(liq),
                '"}'
            );
        }
        result = abi.encode(resultStr);
    }

    function executePoolFee(bytes memory params) internal view returns (bytes memory result) {
        (address tokenA, address tokenB) = abi.decode(params, (address, address));
        address pool = IAlgebraFactory(FACTORY).poolByPair(tokenA, tokenB);
        string memory resultStr;
        if (pool == address(0)) {
            resultStr = "No pool found for this pair";
        } else {
            uint16 currentFee = IAlgebraPoolState(pool).fee();
            resultStr = string.concat(
                '{"pool":"', _addressToString(pool),
                '","currentFee":', _uintToString(currentFee),
                '}'
            );
        }
        result = abi.encode(resultStr);
    }

    function _resolveToken(string memory symbol) internal pure returns (address) {
        if (_eq(symbol, "USDC") || _eq(symbol, "usdc")) return USDC;
        if (_eq(symbol, "WETH") || _eq(symbol, "weth")) return WETH;
        if (_eq(symbol, "WSTT") || _eq(symbol, "wstt")) return WSTT;
        if (_isSTT(symbol)) return address(0);
        return address(0);
    }

    function _isSTT(string memory symbol) internal pure returns (bool) {
        return _eq(symbol, "STT") || _eq(symbol, "stt");
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    function _addressToString(address a) internal pure returns (string memory) {
        bytes32 v = bytes32(bytes20(a));
        bytes memory r = new bytes(42);
        r[0] = "0";
        r[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            r[2 + i * 2] = _nibble(uint8(v[i + 12]) >> 4);
            r[3 + i * 2] = _nibble(uint8(v[i + 12]) & 0xf);
        }
        return string(r);
    }

    function _nibble(uint8 n) internal pure returns (bytes1) {
        if (n < 10) return bytes1(48 + n);
        return bytes1(87 + n);
    }

    function _int24ToString(int24 v) internal pure returns (string memory) {
        if (v < 0) return string.concat("-", _uintToString(uint256(uint24(-v))));
        return _uintToString(uint256(uint24(v)));
    }

    function _uintToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 len = 78;
        bytes memory r = new bytes(len);
        uint256 i = len - 1;
        while (v > 0) {
            r[i--] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        bytes memory result = new bytes(len - i - 1);
        for (uint256 j = 0; j < result.length; j++) {
            result[j] = r[i + 1 + j];
        }
        return string(result);
    }
}
