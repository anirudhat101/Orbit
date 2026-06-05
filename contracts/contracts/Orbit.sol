// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ISomniaAgents.sol";

interface IDex {
    function getPoolId(address tokenA, address tokenB) external view returns (bytes32);
    function pools(bytes32 id) external view returns (address token0, address token1, uint256 reserve0, uint256 reserve1, uint256 totalSupply);
}

contract Orbit {
    IAgentRequester public constant PLATFORM =
        IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

    uint256 public constant LLM_AGENT_ID = 12847293847561029384;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant PRICE_PER_AGENT = 0.1 ether;

    bytes4 private constant SWAP = bytes4(keccak256("swap(address,address,uint256)"));
    bytes4 private constant PING = bytes4(keccak256("ping()"));

    IDex public dex;

    enum Phase { Idle, AwaitingSelection, ExecutingTools, AwaitingSynthesis, Complete }

    struct ToolExecution {
        string toolCallId;
        bytes4 selector;
        bytes params;
        uint256 agentRequestId;
        bytes result;
    }

    struct Query {
        address user;
        string nlQuery;
        Phase phase;
        string[] selectionRoles;
        string[] selectionMessages;
        string[] pendingToolCallIds;
        bytes[] pendingToolCalls;
        ToolExecution[] executions;
        uint256 pendingCount;
        uint256 budget;
        bytes dashboardPayload;
    }

    mapping(uint256 => Query) public queries;
    mapping(uint256 => uint256) public agentRequestToQuery;
    mapping(uint256 => uint256) public agentRequestToToolIdx;

    uint256 public nextQueryId = 1;

    event Asked(uint256 indexed queryId, address indexed user, string nlQuery, uint256 requestId);
    event ToolsChosen(uint256 indexed queryId, bytes4[] selectors, string[] toolCallIds);
    event ToolDone(uint256 indexed queryId, uint256 toolIndex, string toolCallId, bytes result);
    event Answered(uint256 indexed queryId, bytes dashboardPayload, uint256 requestId);
    event Failed(uint256 indexed queryId, string reason);

    constructor(IDex _dex) {
        dex = _dex;
    }

    function setDex(IDex _dex) external {
        dex = _dex;
    }

    // ── Entry ──

    function ask(string calldata nlQuery) external payable returns (uint256 queryId) {
        uint256 deposit = PLATFORM.getRequestDeposit() + PRICE_PER_AGENT * SUBCOMMITTEE_SIZE;
        require(msg.value >= deposit, "Insufficient deposit");

        queryId = nextQueryId++;

        Query storage q = queries[queryId];
        q.user = msg.sender;
        q.nlQuery = nlQuery;
        q.phase = Phase.AwaitingSelection;
        q.budget = msg.value;

        string[] memory roles = new string[](2);
        roles[0] = "system";
        roles[1] = "user";

        string[] memory messages = new string[](2);
        messages[0] = "You are Orbit, an on-chain blockchain intelligence agent. You have access to swap and Coingecko tools. Decide which tools to call, then synthesize results into a JSON dashboard. Return ONLY the JSON dashboard as your final answer. Dashboard format: {\"summary\":\"...\",\"cards\":[{\"type\":\"price\",\"label\":\"...\",\"value\":0,\"change\":0,\"unit\":\"usd\"}],\"chart\":[{\"label\":\"...\",\"value\":0}]}";
        messages[1] = string.concat("Query: \"", nlQuery, "\"");

        ILLMAgent.OnchainTool[] memory onchainTools = new ILLMAgent.OnchainTool[](2);
        onchainTools[0] = ILLMAgent.OnchainTool("swap(address tokenIn, address tokenOut, uint256 amountIn)", "Get swap quote from the DEX. Returns estimated output amount.");
        onchainTools[1] = ILLMAgent.OnchainTool("ping()", "Test tool that returns pong.");

        string[] memory mcpUrls = new string[](0);

        bytes memory payload = abi.encodeWithSelector(
            ILLMAgent.inferToolsChat.selector,
            roles, messages,
            mcpUrls,
            onchainTools,
            5,
            true
        );

        uint256 requestId = PLATFORM.createRequest{value: deposit}(
            LLM_AGENT_ID,
            address(this),
            this.handleToolSelection.selector,
            payload
        );

        q.budget -= deposit;
        agentRequestToQuery[requestId] = queryId;
        emit Asked(queryId, msg.sender, nlQuery, requestId);
    }

    // ── Tool selection callback ──

    function handleToolSelection(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(PLATFORM), "Only platform");

        uint256 queryId = agentRequestToQuery[requestId];
        Query storage q = queries[queryId];

        if (status != ResponseStatus.Success || responses.length == 0) {
            _refund(q, queryId);
            emit Failed(queryId, "Tool selection failed");
            q.phase = Phase.Complete;
            return;
        }

        (
            string memory finishReason,
            string memory response,
            string[] memory updatedRoles,
            string[] memory updatedMessages,
            string[] memory toolCallIds,
            bytes[] memory toolCalls
        ) = abi.decode(responses[0].result, (string, string, string[], string[], string[], bytes[]));

        if (_eq(finishReason, "stop")) {
            q.dashboardPayload = bytes(response);
            q.phase = Phase.Complete;
            _refund(q, queryId);
            emit Answered(queryId, bytes(response), 0);
            return;
        }

        require(toolCalls.length > 0, "No tools selected");
        require(_eq(finishReason, "tool_calls"), "Unexpected finish reason");

        q.selectionRoles = updatedRoles;
        q.selectionMessages = updatedMessages;
        q.pendingToolCallIds = toolCallIds;
        q.pendingToolCalls = toolCalls;
        q.phase = Phase.ExecutingTools;
        q.pendingCount = toolCalls.length;

        bytes4[] memory selectors = new bytes4[](toolCalls.length);
        for (uint256 i = 0; i < toolCalls.length; i++) {
            selectors[i] = bytes4(toolCalls[i]);
        }
        emit ToolsChosen(queryId, selectors, toolCallIds);

        uint256 deposit = PLATFORM.getRequestDeposit() + PRICE_PER_AGENT * SUBCOMMITTEE_SIZE;

        for (uint256 i = 0; i < toolCalls.length; i++) {
            require(q.budget >= deposit, "Insufficient budget");

            bytes4 selector = bytes4(toolCalls[i]);
            bytes memory params = _sliceBytes(toolCalls[i], 4, toolCalls[i].length - 4);

            q.executions.push();
            ToolExecution storage exec = q.executions[i];
            exec.toolCallId = toolCallIds[i];
            exec.selector = selector;
            exec.params = params;

            if (selector == SWAP) {
                (address tokenIn, address tokenOut, uint256 amountIn) = abi.decode(params, (address, address, uint256));
                bytes32 poolId = dex.getPoolId(tokenIn, tokenOut);
                (address t0, , uint256 rsv0, uint256 rsv1, ) = dex.pools(poolId);
                bool isToken0 = tokenIn == t0;
                uint256 reserveIn = isToken0 ? rsv0 : rsv1;
                uint256 reserveOut = isToken0 ? rsv1 : rsv0;
                uint256 amountInWithFee = (amountIn * 997) / 1000;
                uint256 amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);
                exec.result = abi.encode(amountOut);
                q.pendingCount--;
                emit ToolDone(queryId, i, exec.toolCallId, exec.result);
            } else if (selector == PING) {
                exec.result = abi.encode("pong");
                q.pendingCount--;
                emit ToolDone(queryId, i, exec.toolCallId, exec.result);
            } else {
                (bytes memory agentPayload, uint256 agentId) = _mapToolToAgent(selector, params);
                if (agentPayload.length > 0 && agentId > 0) {
                    uint256 reqId = PLATFORM.createRequest{value: deposit}(
                        agentId,
                        address(this),
                        this.handleToolResult.selector,
                        agentPayload
                    );
                    exec.agentRequestId = reqId;
                    q.budget -= deposit;
                    agentRequestToQuery[reqId] = queryId;
                    agentRequestToToolIdx[reqId] = i;
                } else {
                    q.pendingCount--;
                }
            }
        }

        if (q.pendingCount == 0) {
            _resumeAndSynthesize(queryId);
        }
    }

    // ── Tool execution callback ──

    function handleToolResult(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(PLATFORM), "Only platform");

        uint256 queryId = agentRequestToQuery[requestId];
        uint256 toolIdx = agentRequestToToolIdx[requestId];
        Query storage q = queries[queryId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            q.executions[toolIdx].result = responses[0].result;
        } else {
            q.executions[toolIdx].result = bytes("");
        }

        emit ToolDone(queryId, toolIdx, q.executions[toolIdx].toolCallId, q.executions[toolIdx].result);

        q.pendingCount--;

        if (q.pendingCount == 0) {
            _resumeAndSynthesize(queryId);
        }
    }

    // ── Resume LLM with tool results ──

    function _resumeAndSynthesize(uint256 queryId) internal {
        Query storage q = queries[queryId];
        q.phase = Phase.AwaitingSynthesis;

        uint256 oldLen = q.selectionRoles.length;
        uint256 toolCount = q.executions.length;

        string[] memory resumeRoles = new string[](oldLen + toolCount);
        string[] memory resumeMessages = new string[](oldLen + toolCount);

        for (uint256 i = 0; i < oldLen; i++) {
            resumeRoles[i] = q.selectionRoles[i];
            resumeMessages[i] = q.selectionMessages[i];
        }

        for (uint256 i = 0; i < toolCount; i++) {
            resumeRoles[oldLen + i] = "tool";
            string memory content = _formatResult(
                q.executions[i].selector,
                q.executions[i].result
            );
            resumeMessages[oldLen + i] = string.concat(
                '{"tool_call_id":"', q.executions[i].toolCallId,
                '","content":"', content, '"}'
            );
        }

        ILLMAgent.OnchainTool[] memory emptyTools = new ILLMAgent.OnchainTool[](0);

        bytes memory payload = abi.encodeWithSelector(
            ILLMAgent.inferToolsChat.selector,
            resumeRoles, resumeMessages,
            new string[](0),
            emptyTools,
            1,
            true
        );

        uint256 deposit = PLATFORM.getRequestDeposit() + PRICE_PER_AGENT * SUBCOMMITTEE_SIZE;
        require(q.budget >= deposit, "Insufficient budget for synthesis");

        uint256 newRequestId = PLATFORM.createRequest{value: deposit}(
            LLM_AGENT_ID,
            address(this),
            this.handleSynthesis.selector,
            payload
        );

        q.budget -= deposit;
        agentRequestToQuery[newRequestId] = queryId;
    }

    // ── Final synthesis callback ──

    function handleSynthesis(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(PLATFORM), "Only platform");

        uint256 queryId = agentRequestToQuery[requestId];
        Query storage q = queries[queryId];

        if (status == ResponseStatus.Success && responses.length > 0) {
            q.dashboardPayload = responses[0].result;
            q.phase = Phase.Complete;
            _refund(q, queryId);
            emit Answered(queryId, q.dashboardPayload, requestId);
        } else {
            _refund(q, queryId);
            emit Failed(queryId, "Synthesis failed");
            q.phase = Phase.Complete;
        }
    }

    // ── Tool → Agent mapping ──

    function _mapToolToAgent(bytes4, bytes memory) internal pure returns (bytes memory, uint256) {
        return (bytes(""), 0);
    }

    // ── Helpers ──

    function _formatResult(bytes4 selector, bytes memory data) internal pure returns (string memory) {
        if (data.length == 0) return "empty";
        if (selector == SWAP) {
            uint256 val = abi.decode(data, (uint256));
            return _uintToString(val);
        }
        if (selector == PING) {
            return abi.decode(data, (string));
        }
        return abi.decode(data, (string));
    }

    function _sliceBytes(bytes memory data, uint256 start, uint256 len) internal pure returns (bytes memory) {
        bytes memory result = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = data[start + i];
        }
        return result;
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
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

    function _refund(Query storage q, uint256) internal {
        if (q.budget > 0) {
            uint256 amount = q.budget;
            q.budget = 0;
            payable(q.user).transfer(amount);
        }
    }

    function getRequiredDeposit() external view returns (uint256) {
        return PLATFORM.getRequestDeposit();
    }

    receive() external payable {}
}
