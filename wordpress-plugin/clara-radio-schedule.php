<?php
/**
 * Plugin Name: Clara Radio Schedule
 * Plugin URI: https://clara.koodh.com
 * Description: Displays radio schedule from Clara Radio Dashboard. Replaces ProRadio schedule display.
 * Version: 1.0.0
 * Author: Koodh
 * License: GPL v2 or later
 * Text Domain: clara-radio-schedule
 */

if (!defined('ABSPATH')) {
    exit;
}

class Clara_Radio_Schedule {
    
    private static $instance = null;
    private $options;
    
    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        $this->options = get_option('clara_schedule_options', array());
        
        // Admin hooks
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        
        // Frontend hooks
        add_shortcode('clara_schedule', array($this, 'render_schedule_shortcode'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));
        
        // REST API endpoints (ProRadio compatibility)
        add_action('rest_api_init', array($this, 'register_rest_routes'));
    }
    
    /**
     * Add admin menu page
     */
    public function add_admin_menu() {
        add_options_page(
            'Clara Radio Schedule',
            'Clara Schedule',
            'manage_options',
            'clara-radio-schedule',
            array($this, 'render_admin_page')
        );
    }
    
    /**
     * Register plugin settings
     */
    public function register_settings() {
        register_setting('clara_schedule_options', 'clara_schedule_options', array($this, 'sanitize_options'));
        
        add_settings_section(
            'clara_schedule_main',
            'API Configuration',
            array($this, 'section_callback'),
            'clara-radio-schedule'
        );
        
        add_settings_field(
            'api_url',
            'Clara API URL',
            array($this, 'api_url_callback'),
            'clara-radio-schedule',
            'clara_schedule_main'
        );
        
        add_settings_field(
            'main_site_id',
            'Main Site ID',
            array($this, 'main_site_id_callback'),
            'clara-radio-schedule',
            'clara_schedule_main'
        );
        
        add_settings_field(
            'station',
            'Station',
            array($this, 'station_callback'),
            'clara-radio-schedule',
            'clara_schedule_main'
        );
        
        add_settings_field(
            'cache_duration',
            'Cache Duration (minutes)',
            array($this, 'cache_duration_callback'),
            'clara-radio-schedule',
            'clara_schedule_main'
        );
    }
    
    public function section_callback() {
        echo '<p>Configure the connection to your Clara Radio Dashboard.</p>';
    }
    
    public function api_url_callback() {
        $value = isset($this->options['api_url']) ? $this->options['api_url'] : '';
        echo '<input type="url" name="clara_schedule_options[api_url]" value="' . esc_attr($value) . '" class="regular-text" placeholder="https://clara.koodh.com" />';
        echo '<p class="description">The base URL of your Clara installation (without /api)</p>';
    }
    
    public function main_site_id_callback() {
        $value = isset($this->options['main_site_id']) ? $this->options['main_site_id'] : '';
        echo '<input type="text" name="clara_schedule_options[main_site_id]" value="' . esc_attr($value) . '" class="regular-text" placeholder="db23c31a-7776-4805-a4a5-bd019dd7c2be" />';
        echo '<p class="description">Your Main Site ID from Clara (found in Network Admin)</p>';
    }
    
    public function station_callback() {
        $value = isset($this->options['station']) ? $this->options['station'] : 'both';
        ?>
        <select name="clara_schedule_options[station]">
            <option value="mfy" <?php selected($value, 'mfy'); ?>>MFY only</option>
            <option value="grk" <?php selected($value, 'grk'); ?>>GRK only</option>
            <option value="both" <?php selected($value, 'both'); ?>>Both stations</option>
        </select>
        <p class="description">Which station's schedule to display</p>
        <?php
    }
    
    public function cache_duration_callback() {
        $value = isset($this->options['cache_duration']) ? $this->options['cache_duration'] : 5;
        echo '<input type="number" name="clara_schedule_options[cache_duration]" value="' . esc_attr($value) . '" min="1" max="60" class="small-text" /> minutes';
        echo '<p class="description">How long to cache the schedule data (reduces API calls)</p>';
    }
    
    public function sanitize_options($input) {
        $sanitized = array();
        
        if (isset($input['api_url'])) {
            $sanitized['api_url'] = esc_url_raw(rtrim($input['api_url'], '/'));
        }
        
        if (isset($input['main_site_id'])) {
            $sanitized['main_site_id'] = sanitize_text_field($input['main_site_id']);
        }
        
        if (isset($input['station'])) {
            $sanitized['station'] = in_array($input['station'], array('mfy', 'grk', 'both')) ? $input['station'] : 'both';
        }
        
        if (isset($input['cache_duration'])) {
            $sanitized['cache_duration'] = absint($input['cache_duration']);
            if ($sanitized['cache_duration'] < 1) $sanitized['cache_duration'] = 1;
            if ($sanitized['cache_duration'] > 60) $sanitized['cache_duration'] = 60;
        }
        
        // Clear cache when settings change
        delete_transient('clara_schedule_data');
        
        return $sanitized;
    }
    
    /**
     * Render admin settings page
     */
    public function render_admin_page() {
        ?>
        <div class="wrap">
            <h1>Clara Radio Schedule Settings</h1>
            
            <form method="post" action="options.php">
                <?php
                settings_fields('clara_schedule_options');
                do_settings_sections('clara-radio-schedule');
                submit_button();
                ?>
            </form>
            
            <hr />
            
            <h2>Connection Test</h2>
            <p>
                <button type="button" class="button" id="clara-test-connection">Test Connection</button>
                <span id="clara-test-result" style="margin-left: 10px;"></span>
            </p>
            
            <hr />
            
            <h2>Usage</h2>
            <p>Use the shortcode <code>[clara_schedule]</code> to display the schedule on any page or post.</p>
            <p>Optional parameters:</p>
            <ul>
                <li><code>[clara_schedule station="mfy"]</code> - Show only MFY schedule</li>
                <li><code>[clara_schedule station="grk"]</code> - Show only GRK schedule</li>
                <li><code>[clara_schedule day="maandag"]</code> - Show only Monday's schedule</li>
            </ul>
            
            <h3>ProRadio Compatibility</h3>
            <p>This plugin also provides REST API endpoints for ProRadio theme compatibility:</p>
            <ul>
                <li><code>/wp-json/proradio/v1/schedule</code> - Full week schedule</li>
                <li><code>/wp-json/proradio/v1/schedule-today-full/</code> - Today's schedule</li>
            </ul>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            $('#clara-test-connection').on('click', function() {
                var $btn = $(this);
                var $result = $('#clara-test-result');
                
                $btn.prop('disabled', true);
                $result.html('<span style="color: #666;">Testing...</span>');
                
                $.ajax({
                    url: ajaxurl,
                    method: 'POST',
                    data: {
                        action: 'clara_test_connection'
                    },
                    success: function(response) {
                        if (response.success) {
                            $result.html('<span style="color: green;">✓ ' + response.data.message + '</span>');
                        } else {
                            $result.html('<span style="color: red;">✗ ' + response.data.message + '</span>');
                        }
                    },
                    error: function() {
                        $result.html('<span style="color: red;">✗ Connection failed</span>');
                    },
                    complete: function() {
                        $btn.prop('disabled', false);
                    }
                });
            });
        });
        </script>
        <?php
    }
    
    /**
     * AJAX handler for connection test
     */
    public function test_connection() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => 'Permission denied'));
        }
        
        $schedule = $this->fetch_schedule_from_api();
        
        if ($schedule === false) {
            wp_send_json_error(array('message' => 'Could not connect to Clara API'));
        }
        
        $total_shows = 0;
        foreach ($schedule as $day => $shows) {
            $total_shows += count($shows);
        }
        
        wp_send_json_success(array(
            'message' => "Connected! Found {$total_shows} shows this week."
        ));
    }
    
    /**
     * Fetch schedule data from Clara API
     */
    private function fetch_schedule_from_api($station = null) {
        $api_url = isset($this->options['api_url']) ? $this->options['api_url'] : '';
        $main_site_id = isset($this->options['main_site_id']) ? $this->options['main_site_id'] : '';
        $default_station = isset($this->options['station']) ? $this->options['station'] : 'both';
        
        if (empty($api_url) || empty($main_site_id)) {
            return false;
        }
        
        $station = $station ?: $default_station;
        $cache_key = 'clara_schedule_' . $station;
        $cache_duration = isset($this->options['cache_duration']) ? absint($this->options['cache_duration']) : 5;
        
        // Check cache first
        $cached = get_transient($cache_key);
        if ($cached !== false) {
            return $cached;
        }
        
        // Fetch from API
        $url = $api_url . '/api/public/schedule/' . $station . '?main_site_id=' . urlencode($main_site_id);
        
        $response = wp_remote_get($url, array(
            'timeout' => 15,
            'headers' => array(
                'Accept' => 'application/json',
            )
        ));
        
        if (is_wp_error($response)) {
            error_log('Clara Schedule API Error: ' . $response->get_error_message());
            return false;
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (json_last_error() !== JSON_ERROR_NONE || isset($data['error'])) {
            error_log('Clara Schedule API Error: Invalid JSON or API error');
            return false;
        }
        
        // Cache the result
        set_transient($cache_key, $data, $cache_duration * MINUTE_IN_SECONDS);
        
        return $data;
    }
    
    /**
     * Enqueue frontend CSS
     */
    public function enqueue_frontend_assets() {
        wp_enqueue_style(
            'clara-schedule',
            plugin_dir_url(__FILE__) . 'clara-schedule.css',
            array(),
            '1.0.0'
        );
    }
    
    /**
     * Render schedule shortcode
     */
    public function render_schedule_shortcode($atts) {
        $atts = shortcode_atts(array(
            'station' => null,
            'day' => null,
        ), $atts);
        
        $schedule = $this->fetch_schedule_from_api($atts['station']);
        
        if ($schedule === false) {
            return '<div class="clara-schedule-error">Could not load schedule. Please check plugin settings.</div>';
        }
        
        // Dutch day names in order
        $days_order = array('maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag');
        $days_dutch = array(
            'maandag' => 'Maandag',
            'dinsdag' => 'Dinsdag',
            'woensdag' => 'Woensdag',
            'donderdag' => 'Donderdag',
            'vrijdag' => 'Vrijdag',
            'zaterdag' => 'Zaterdag',
            'zondag' => 'Zondag'
        );
        
        // Filter by day if specified
        if (!empty($atts['day'])) {
            $day_key = strtolower($atts['day']);
            if (isset($schedule[$day_key])) {
                $schedule = array($day_key => $schedule[$day_key]);
            }
        }
        
        ob_start();
        ?>
        <div class="clara-schedule">
            <?php foreach ($days_order as $day_key): ?>
                <?php if (!isset($schedule[$day_key])) continue; ?>
                <?php $shows = $schedule[$day_key]; ?>
                
                <div class="clara-schedule-day">
                    <h3 class="clara-schedule-day-title"><?php echo esc_html($days_dutch[$day_key]); ?></h3>
                    
                    <?php if (empty($shows)): ?>
                        <p class="clara-schedule-empty">Geen programma's</p>
                    <?php else: ?>
                        <div class="clara-schedule-shows">
                            <?php foreach ($shows as $show): ?>
                                <div class="clara-schedule-show">
                                    <?php if (!empty($show['image'])): ?>
                                        <div class="clara-schedule-show-image">
                                            <img src="<?php echo esc_url($show['image']); ?>" alt="<?php echo esc_attr($show['title']); ?>" />
                                        </div>
                                    <?php endif; ?>
                                    
                                    <div class="clara-schedule-show-info">
                                        <div class="clara-schedule-show-time">
                                            <?php echo esc_html($show['start_time']); ?> - <?php echo esc_html($show['end_time']); ?>
                                        </div>
                                        <div class="clara-schedule-show-title">
                                            <?php echo esc_html($show['title']); ?>
                                        </div>
                                        <?php if (!empty($show['presenter'])): ?>
                                            <div class="clara-schedule-show-presenter">
                                                <?php echo esc_html($show['presenter']); ?>
                                            </div>
                                        <?php endif; ?>
                                        <?php if (!empty($show['description'])): ?>
                                            <div class="clara-schedule-show-description">
                                                <?php echo esc_html($show['description']); ?>
                                            </div>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        </div>
        <?php
        return ob_get_clean();
    }
    
    /**
     * Register REST API routes for ProRadio compatibility
     */
    public function register_rest_routes() {
        // Full schedule endpoint
        register_rest_route('proradio/v1', '/schedule', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_schedule'),
            'permission_callback' => '__return_true'
        ));
        
        // Today's schedule endpoint
        register_rest_route('proradio/v1', '/schedule-today-full/', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_schedule_today'),
            'permission_callback' => '__return_true'
        ));
    }
    
    /**
     * REST API: Get full week schedule
     */
    public function rest_get_schedule($request) {
        $schedule = $this->fetch_schedule_from_api();
        
        if ($schedule === false) {
            return new WP_Error('api_error', 'Could not fetch schedule', array('status' => 500));
        }
        
        // Transform to ProRadio format
        $posts = array();
        $days_dutch = array(
            'maandag' => 'Maandag',
            'dinsdag' => 'Dinsdag',
            'woensdag' => 'Woensdag',
            'donderdag' => 'Donderdag',
            'vrijdag' => 'Vrijdag',
            'zaterdag' => 'Zaterdag',
            'zondag' => 'Zondag'
        );
        
        $day_id = 1;
        foreach ($schedule as $day_key => $shows) {
            $shows_data = array();
            foreach ($shows as $show) {
                $shows_data[] = array(
                    'show_id' => array($show['id']),
                    'show_time' => $show['start_time'],
                    'show_time_end' => $show['end_time'],
                    'show_name' => $show['title'],
                    'show_thumbnail' => $show['image'] ?: false,
                    'show_presenter' => $show['presenter'] ?: ''
                );
            }
            
            $posts[] = array(
                'ID' => $day_id,
                'post_title' => $days_dutch[$day_key] ?? ucfirst($day_key),
                'shows' => $shows_data
            );
            $day_id++;
        }
        
        return array('posts' => $posts);
    }
    
    /**
     * REST API: Get today's schedule
     */
    public function rest_get_schedule_today($request) {
        $api_url = isset($this->options['api_url']) ? $this->options['api_url'] : '';
        $main_site_id = isset($this->options['main_site_id']) ? $this->options['main_site_id'] : '';
        $station = isset($this->options['station']) ? $this->options['station'] : 'both';
        
        if (empty($api_url) || empty($main_site_id)) {
            return new WP_Error('config_error', 'Plugin not configured', array('status' => 500));
        }
        
        // Fetch today's schedule directly
        $url = $api_url . '/api/public/schedule/' . $station . '/today?main_site_id=' . urlencode($main_site_id);
        
        $response = wp_remote_get($url, array(
            'timeout' => 15,
            'headers' => array('Accept' => 'application/json')
        ));
        
        if (is_wp_error($response)) {
            return new WP_Error('api_error', 'Could not fetch schedule', array('status' => 500));
        }
        
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            return new WP_Error('parse_error', 'Invalid API response', array('status' => 500));
        }
        
        return $data;
    }
}

// Initialize plugin
add_action('plugins_loaded', array('Clara_Radio_Schedule', 'get_instance'));

// Register AJAX handler
add_action('wp_ajax_clara_test_connection', array(Clara_Radio_Schedule::get_instance(), 'test_connection'));
