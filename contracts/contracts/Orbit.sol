// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ISomniaAgents.sol";

/// @title Orbit
/// @notice Natural language → blockchain intelligence → live dashboards
/// @dev Uses inferToolsChat for native LLM tool calling with yield-resume pattern.
///   Flow: ask() → LLM selects tools → spawn Somnia agents → resume LLM → dashboard
///
/// AGENTS: LLM Inference (12847293847561029384)
///         JSON API Request (13174292974160097713)
///         LLM Parse Website (12875401142070969085)

contract Orbit {
    IAgentRequester public constant PLATFORM =
        IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

    uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 public constant LLM_AGENT_ID = 12847293847561029384;
    uint256 public constant PARSE_WEBSITE_AGENT_ID = 12875401142070969085;

    bytes4 private constant GET_PRICE = bytes4(keccak256("getPrice(string,string)"));
    bytes4 private constant ANALYZE_SENTIMENT = bytes4(keccak256("analyzeSentiment(string)"));
    bytes4 private constant SCRAPE_WEB = bytes4(keccak256("scrapeWeb(string,string)"));

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

    event Asked(uint256 indexed queryId, address indexed user, string nlQuery);
    event ToolsChosen(uint256 indexed queryId, bytes4[] selectors, string[] toolCallIds);
    event ToolDone(uint256 indexed queryId, uint256 toolIndex, string toolCallId, bytes result);
    event Answered(uint256 indexed queryId, bytes dashboardPayload);
    event Failed(uint256 indexed queryId, string reason);

    // ──────────────────────────────────────────────
    // Entry
    // ──────────────────────────────────────────────

    /// @notice Ask Orbit a natural language question
    /// @param nlQuery The query (e.g., "Give me yesterday's BTC price")
    /// @dev Send enough ETH for all steps (recommended: 5x getRequestDeposit())
    function ask(string calldata nlQuery) external payable returns (uint256 queryId) {
        uint256 deposit = PLATFORM.getRequestDeposit();
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
        messages[0] = "You are Orbit, an on-chain blockchain intelligence agent. You have access to tools for fetching crypto data. Decide which tools to call, then synthesize results into a JSON dashboard. Return ONLY the JSON dashboard as your final answer. Dashboard format: {\"summary\":\"...\",\"cards\":[{\"type\":\"price\",\"label\":\"...\",\"value\":0,\"change\":0,\"unit\":\"usd\"}],\"chart\":[{\"label\":\"...\",\"value\":0}]}";
        messages[1] = string.concat("Query: \"", nlQuery, "\"");

        ILLMAgent.OnchainTool[] memory onchainTools = new ILLMAgent.OnchainTool[](3);
        onchainTools[0] = ILLMAgent.OnchainTool("getPrice(string asset, string vsCurrency)", "Fetch crypto price from CoinGecko. asset is coin id like 'bitcoin', 'ethereum'. vsCurrency is 'usd'.");
        onchainTools[1] = ILLMAgent.OnchainTool("analyzeSentiment(string text)", "Analyze crypto market sentiment of text. Returns bullish/bearish/neutral.");
        onchainTools[2] = ILLMAgent.OnchainTool("scrapeWeb(string url, string prompt)", "Extract info from a website. url is domain or full URL. prompt describes what to extract.");

        bytes memory payload = abi.encodeWithSelector(
            ILLMAgent.inferToolsChat.selector,
            roles, messages,
            new string[](0),
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
        emit Asked(queryId, msg.sender, nlQuery);
    }

    // ──────────────────────────────────────────────
    // Tool selection callback
    // ──────────────────────────────────────────────

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
            emit Answered(queryId, bytes(response));
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

        uint256 deposit = PLATFORM.getRequestDeposit();

        for (uint256 i = 0; i < toolCalls.length; i++) {
            require(q.budget >= deposit, "Insufficient budget");

            bytes4 selector = bytes4(toolCalls[i]);
            bytes memory params = _sliceBytes(toolCalls[i], 4, toolCalls[i].length - 4);

            q.executions.push();
            ToolExecution storage exec = q.executions[i];
            exec.toolCallId = toolCallIds[i];
            exec.selector = selector;
            exec.params = params;

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

        if (q.pendingCount == 0) {
            _resumeAndSynthesize(queryId);
        }
    }

    // ──────────────────────────────────────────────
    // Tool execution callback
    // ──────────────────────────────────────────────

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

    // ──────────────────────────────────────────────
    // Resume LLM with tool results
    // ──────────────────────────────────────────────

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

        uint256 deposit = PLATFORM.getRequestDeposit();
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

    // ──────────────────────────────────────────────
    // Final synthesis callback
    // ──────────────────────────────────────────────

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
            emit Answered(queryId, q.dashboardPayload);
        } else {
            _refund(q, queryId);
            emit Failed(queryId, "Synthesis failed");
            q.phase = Phase.Complete;
        }
    }

    // ──────────────────────────────────────────────
    // Tool → Agent mapping
    // ──────────────────────────────────────────────

    function _mapToolToAgent(bytes4 selector, bytes memory params) internal pure returns (bytes memory, uint256) {
        if (selector == GET_PRICE) {
            (string memory asset, string memory vsCurrency) = abi.decode(params, (string, string));
            return _buildPricePayload(asset, vsCurrency);
        }
        if (selector == ANALYZE_SENTIMENT) {
            (string memory text) = abi.decode(params, (string));
            return _buildSentimentPayload(text);
        }
        if (selector == SCRAPE_WEB) {
            (string memory url, string memory prompt) = abi.decode(params, (string, string));
            return _buildScrapePayload(url, prompt);
        }
        return (bytes(""), 0);
    }

    function _buildPricePayload(string memory asset, string memory vsCurrency) internal pure returns (bytes memory, uint256) {
        string memory url = string.concat(
            "https://api.coingecko.com/api/v3/simple/price?ids=",
            asset, "&vs_currencies=", vsCurrency
        );
        string memory selector = string.concat(asset, ".", vsCurrency);

        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchUint.selector, url, selector, uint8(8)
        );
        return (payload, JSON_API_AGENT_ID);
    }

    function _buildSentimentPayload(string memory text) internal pure returns (bytes memory, uint256) {
        string memory prompt = string.concat(
            "Analyze the sentiment of this crypto text: \"", text, "\". "
            "Classify as bullish, bearish, or neutral."
        );

        string[] memory allowed = new string[](3);
        allowed[0] = "bullish";
        allowed[1] = "bearish";
        allowed[2] = "neutral";

        bytes memory payload = abi.encodeWithSelector(
            ILLMAgent.inferString.selector, prompt,
            "You are a crypto sentiment analyst.", false, allowed
        );
        return (payload, LLM_AGENT_ID);
    }

    function _buildScrapePayload(string memory url, string memory prompt) internal pure returns (bytes memory, uint256) {
        string[] memory options = new string[](0);

        bytes memory payload = abi.encodeWithSelector(
            IParseWebsiteAgent.ExtractString.selector,
            "result", prompt, options, prompt, url, true, uint8(3)
        );
        return (payload, PARSE_WEBSITE_AGENT_ID);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _formatResult(bytes4 selector, bytes memory data) internal pure returns (string memory) {
        if (data.length == 0) return "empty";
        if (selector == GET_PRICE) {
            uint256 val = abi.decode(data, (uint256));
            return _uintToString(val);
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
